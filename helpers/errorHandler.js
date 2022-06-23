const adminChatId = [519613720, 1392922267];

/**
 *
 * @param {Object} err error
 * @param {String} name name of error
 * @param {Object} ctx context of telegraf
 */
module.exports = ({ err, name, ctx, usermsg }) => {
  console.log(`\n======= ERROR: ${name} =======`);
  let data;
  if (err.response) {
    console.log({ data: err.response.data });
    console.log({ status: err.response.status });
    console.log({ header: err.response.headers });

    let str = {
      headers: JSON.stringify(err.response.headers, null, "-  "),
      config: JSON.stringify(err.config, null, "-  "),
    };
    data = `Data: ${err.data}\n\nStatus: ${err.status}\n\nHeaders: ${str.headers}\n\nConfig: ${str.config}`;
  } else if (err.request) {
    console.log({ request: err.request });

    let str = {
      request: JSON.stringify(err.request, null, "-  "),
      config: JSON.stringify(err?.config, null, "-  ") || "null",
    };
    data = `Request: ${str.request}\n\nConfig: ${str.config}`;
  } else {
    console.log({ message: err.message });

    let str = {
      config: JSON.stringify(err?.config, null, "-  ") || "null",
    };
    data = `Message: ${err.message}\n\nConfig: ${str.config}`;
  }
  console.log({ config: err.config });
  console.log(`===========ERROR: ${name} ===========`);

  if (ctx) {
    // notify admin
    adminChatId.forEach(async (item) => {
      ctx.telegram.sendMessage(item, `==== ${name} ====\n${data}`);
    });

    // notify user
    if (usermsg) ctx.reply(usermsg);
  }
};
