const axios = require('axios');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

require('dotenv').config();
const FormData = require('form-data');

// const supabase = require('../supabase');

const { BOT_TOKEN } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

let getFile = async (url) => {
  try {
    console.log('get file');

    let getUrl = await axios({
      method: 'get',
      url: `https://sci-hub.se/${url}`,
    }).then((res) => {
      const { document } = new JSDOM(res.data).window;
      let getEl = document.getElementById('pdf');

      console.log({ getEl });

      if (!getEl) {
        return {
          data: null,
          error: "Unfortunately, Sci-Hub doesn't have the requested document :-(",
        };
      }

      let src = getEl.src;
      let fileUrl;
      if (src.includes('sci-hub')) {
        fileUrl = 'https:' + getEl.src;
      } else {
        fileUrl = 'https://sci-hub.se' + getEl.src;
      }

      return { data: fileUrl, error: null };
    });

    console.log({ getUrl });

    if (getUrl.error) return getUrl;

    let downloadFile = await axios({
      method: 'get',
      url: getUrl.data,
      responseType: 'arraybuffer',
    }).then((res) => {
      return res.data;
    });

    console.log({ downloadFile });

    return { data: downloadFile, error: null };
  } catch (err) {
    await sendMessage({
      chat_id: 1392922267,
      text: `ERROR!! \n${err}`,
    });

    return { data: null, error: err };
  }
};

const sendFile = async (data) => {
  const formData = new FormData();
  formData.append('chat_id', data.chat_id);
  formData.append('reply_to_message_id', data.message_id);
  formData.append('document', data.document, {
    filename: `${data.name}`,
    contentType: 'multipart/form-data',
  });

  return await axios.post(`${TELEGRAM_API}/sendDocument`, formData, {
    headers: formData.getHeaders(),
  });
};

const deleteMessage = async (options) => {
  const { data } = await axios.post(`${TELEGRAM_API}/deleteMessage`, options);

  return data;
};

const sendMessage = async (options) => {
  const { data } = await axios.post(`${TELEGRAM_API}/sendMessage`, options);

  return data.result;
};

module.exports = { getFile, sendFile, deleteMessage, sendMessage };
