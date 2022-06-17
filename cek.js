const axios = require("axios");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { parse } = require("node-html-parser");

// read meta
const readMeta = (el, name) => {
  const prop = el.getAttribute("name") || el.getAttribute("property");
  return prop === name ? el.getAttribute("content") : null;
};

(async () => {
  const parseData = {
    og: {},
    meta: {},
    images: {},
    citation: {},
  };
  const { data } = await axios.get("https://www.nature.com/articles/laban.665");
  const document = parse(data);

  // get title
  let title = document.querySelector("title");
  if (title) parseData.meta.title = title.text;

  // get meta
  let metas = document.querySelectorAll("meta");
  metas.forEach((item) => {
    const content = item.getAttribute("content");
    const prop = item.getAttribute("name") || item.getAttribute("property");
    let propSplit;
    if (prop) propSplit = prop.split("_");

    ["title", "description", "image"].forEach((s) => {
      let result = prop === s ? content : null;
      if (result) parseData.meta[s] = result;
    });

    if (prop && prop.includes("og:")) {
      parseData.og[prop.split(":")[1]] = content;
    }

    if (prop && prop.includes("dc.")) {
      let propName = prop.split(".")[1];

      if (parseData.dc[propName]) {
        if (!Array.isArray(parseData.dc[propName])) {
          parseData.dc[propName] = [parseData.dc[propName], content];
        } else {
          parseData.dc[propName].push(content);
        }
      } else {
        parseData.dc[propName] = content;
      }

      // console.log({ prop: prop.split(".")[1], content });
      // console.log(parseData.dc[prop.split(".")]);
      // parseData.dc[prop.split(".")[1]] = content;
    }

    if (prop && propSplit[0] === "citation" && !content.includes("citation_")) {
      propSplit.shift();
      let propJoin = propSplit.join("_");

      if (parseData.citation[propJoin]) {
        if (!Array.isArray(parseData.citation[propJoin])) {
          parseData.citation[propJoin] = [parseData.citation[propJoin], content];
        } else {
          parseData.citation[propJoin].push(content);
        }
      } else {
        parseData.citation[propJoin] = content;
      }
    } else if (prop && propSplit[0] === "citation" && content.includes("citation_")) {
      let obj = {};
      let cSplit = content.split("citation_");

      cSplit.forEach((item) => {
        if (item) {
          let cSplit2 = item.split("=");
          obj[cSplit2[0]] = cSplit2[1];
        }
      });

      propSplit.shift();
      let propJoin = propSplit.join("_");

      if (parseData.citation[propJoin]) {
        if (!Array.isArray(parseData.citation[propJoin])) {
          parseData.citation[propJoin] = [parseData.citation[propJoin], obj];
        } else {
          parseData.citation[propJoin].push(obj);
        }
      } else {
        parseData.citation[propJoin] = obj;
      }
    }
  });

  // console.log(parseData);

  // var result = await parser('https://www.nature.com/articles/laban.665');
  // console.log(JSON.stringify(result, null, 3));

  // let downloadFile = await axios({
  //   method: 'get',
  //   url: 'https://www.nature.com/articles/laban.665',
  // https://pubs.rsna.org/page/radiographics/rgteam/top10Home
  // responseType: 'arraybuffer',
  // }).then((res) => {
  //   const { document } = new JSDOM(res.data).window;
  //   let getEl = document.querySelector('meta[name="DOI"]').content;
  //   console.log(getEl);
  // });
})();
