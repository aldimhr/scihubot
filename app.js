require('dotenv').config();
const axios = require('axios');
const cors = require('cors');
const express = require('express');

const routes = require('./routes');

const { BOT_TOKEN, SERVER_URL } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const URI = `/webhook/${BOT_TOKEN}`;
const WEBHOOK_URL = SERVER_URL + URI;

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(routes);

const init = async () => {
  const res = await axios.get(`${TELEGRAM_API}/setWebhook?url=${WEBHOOK_URL}`);
  const info = await axios.get(`${TELEGRAM_API}/getWebhookInfo`);
  console.log(res.data);
  console.log(info.data);
};

app.listen(process.env.PORT || 3000, async () => {
  console.log(`app running on port ${process.env.PORT || 3000}`);
  await init();
});
