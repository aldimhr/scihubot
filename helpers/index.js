const axios = require("axios");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

require("dotenv").config();
const FormData = require("form-data");

const db = require("./database");
const citation = require("./citation");

const { BOT_TOKEN } = process.env;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const adminChatId = [519613720, 1392922267];

let getMetaDOI = async (url) => {
  return await axios
    .get(url)
    .then((res) => {
      const { document } = new JSDOM(res.data).window;
      let getEl = document.querySelector('meta[name="citation_doi"]').content;

      if (getEl) {
        return { data: "https://doi.org/" + getEl, error: false };
      } else {
        return {
          data: null,
          error: "Unfortunately, Sci-Hub doesn't have the requested document :-(",
        };
      }
    })
    .catch(async (err) => {
      await sendMessage({
        chat_id: 1392922267,
        text: `Input: ${url}\n\n${err}`,
      });

      return {
        data: null,
        error: "Unfortunately, Sci-Hub doesn't have the requested document :-(",
      };
    });
};

let getFile = async (url) => {
  try {
    console.log("get file");

    let getUrl = await axios.get(`https://sci-hub.ru/${url}`).then((res) => {
      const { document } = new JSDOM(res.data).window;
      let getEl = document.getElementById("pdf");

      // console
      console.log({ getEl });

      if (!getEl) {
        return {
          data: null,
          error: "Unfortunately, Sci-Hub doesn't have the requested document :-(",
        };
      }

      let src = getEl.src;
      let fileUrl;
      if (src.includes("sci-hub")) {
        fileUrl = "https:" + getEl.src;
      } else {
        fileUrl = "https://sci-hub.ru" + getEl.src;
      }

      return { data: fileUrl, error: false };
    });

    // console
    console.log({ getUrl });

    if (getUrl.error) return getUrl;

    let downloadFile = await axios({
      method: "get",
      url: getUrl.data,
      responseType: "arraybuffer",
    }).then((res) => {
      return res.data;
    });

    console.log({ downloadFile });

    console.log("get citation");
    let { data: citationData, error: citationError } = await citation(url);
    console.log({ citationData, citationError });

    return { data: downloadFile, citation: citationData, error: false };
  } catch (err) {
    console.log({ getfile: err });
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.log(error.response.data);
      console.log(error.response.status);
      console.log(error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
      // http.ClientRequest in node.js
      console.log(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.log("Error", error.message);
    }
    console.log(error.config);

    adminChatId.forEach(async (item) => {
      await sendMessage({
        chat_id: item,
        text: err,
      });
    });

    // return { data: null, error: "Error, please try again" };
    return { data: null, error: "UNDER MAINTENANCE" };
  }
};

const sendFile = async (data) => {
  const formData = new FormData();
  formData.append("chat_id", data.chat_id);
  formData.append("reply_to_message_id", data.message_id);
  formData.append("document", data.document, {
    filename: `${data.name}`,
    contentType: "multipart/form-data",
  });

  if (data.caption) {
    formData.append("caption", data.caption);
  }

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

module.exports = { getFile, sendFile, deleteMessage, sendMessage, getMetaDOI, db };
