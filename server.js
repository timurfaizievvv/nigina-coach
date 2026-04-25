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
  await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
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

  // 2. Сообщение в группу
const text = `
📥 Новая заявка

👤 ${name}
📅 ${date}
⏰ ${time}
🏋️ ${training}
📌 ${format}
📞 ${contact}

Статус: ⏳ Ожидание
`;

console.log("📤 Отправка в группу...");

const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: CHAT_ID,
    text,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Принять", callback_data: `approve|${telegram_id}|${date}|${time}` },
          { text: "❌ Отклонить", callback_data: `reject|${telegram_id}|${date}|${time}` }
        ]
      ]
    }
  })
});

const tgData = await tgRes.json();
console.log("📥 Ответ Telegram:", tgData);

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


// 📌 WEBHOOK TELEGRAM
app.post(`/bot${TOKEN}`, async (req, res) => {
  const data = req.body;

  // 📩 ОБРАБОТКА ТЕКСТА
  if (data.message && pendingRejects[data.message.chat.id]) {
    const comment = data.message.text;
    const userId = pendingRejects[data.message.chat.id].userId;
    const info = pendingRejects[data.message.chat.id];

await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: data.message.chat.id,
    message_id: info.messageId,
    text: `
📥 Заявка

👤 ${info.name}
📅 ${info.date}
⏰ ${info.time}
🏋️ ${info.training}
📌 ${info.format}

Статус: ❌ Отклонено
Причина: ${comment}
    `,
    reply_markup: { inline_keyboard: [] }
  })
});

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: userId,
        text: `❌ Заявка отклонена\n\nПричина: ${comment}`
      })
    });

    delete pendingRejects[data.message.chat.id];
  }

  // 📌 КНОПКИ
if (data.callback_query) {
  const callbackId = data.callback_query.id;

  await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackId
    })
  });

  const { data: cbData, message } = data.callback_query;
  const [action, userId, date, time] = cbData.split("|");

    // ✅ ПРИНЯТЬ
    if (action === "approve") {

  // обновляем в базе
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?telegram_id=eq.${userId}&date=eq.${date}&time=eq.${time}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify({ status: "confirmed" })
  });

  // сообщение клиенту
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: userId,
      text: `
✅ Ваша заявка подтверждена

📅 ${date}
⏰ ${time}`
    })
  });

  // 🔥 ОБНОВЛЯЕМ СООБЩЕНИЕ В ГРУППЕ (НЕ ТЕРЯЕМ ДАННЫЕ)
  await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: `
📥 Заявка

👤 ${name}
📅 ${date}
⏰ ${time}
🏋️ ${training}
📌 ${format}

Статус: ✅ Подтверждено
      `,
      reply_markup: { inline_keyboard: [] }
    })
  });
}

    // ❌ ОТКЛОНИТЬ
    if (action === "reject") {
pendingRejects[message.chat.id] = {
  userId,
  date,
  time,
  training,
  format,
  name,
  messageId: message.message_id
};

      await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: "❌ Введите причину отказа:"
        })
      });

      await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: "✏️ Напишите причину отказа:"
        })
      });
    }
  }

  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
