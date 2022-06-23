const axios = require("axios");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

let getFile = async (url) => {
  let getUrl = await axios({
    method: "get",
    url,
  }).then((res) => {
    const { document } = new JSDOM(res.data).window;
    let fileUrl = "https:" + document.getElementById("pdf").src;

    if (!fileUrl)
      return {
        data: null,
        error: "Unfortunately, Sci-Hub doesn't have the requested document :-(",
      };

    return { data: fileUrl, error: null };
  });

  if (getUrl.error) return getUrl;

  let downloadFile = await axios({
    method: "get",
    url: getUrl,
    responseType: "arraybuffer",
  }).then((res) => {
    return res.data;
  });

  return downloadFile;
};
