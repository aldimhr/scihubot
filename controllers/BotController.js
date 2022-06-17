const { getFile, sendFile, sendMessage, deleteMessage, getMetaDOI, db } = require('../helpers');

const adminChatId = [519613720, 1392922267];

let responseMessages = {
  welcome: 'Welcome to Sci-Hub Bot!\n\nHow it works? Simply drop your reference link below',
  inputLink: `Send the reference link below`,
  wait: '🧑‍🍳 Searching your file...',
  incorrect: `Please send a valid reference link below`,
  support: 'For any question or business inquiries please contact @x0code',
  donation:
    'Your support matters. This project survives on the kindness & generosity of your contributions.\n\n☕ https://www.buymeacoffee.com/x0code \n\nThankyou!',
};

module.exports = async (req, res) => {
  try {
    let body = req.body;

    if (body.my_chat_member) {
      adminChatId.forEach(async (chat_id) => {
        await sendMessage({
          chat_id,
          text: `Bot has been deleted by ${body.my_chat_member.chat.id}`,
        });
      });

      return res.send();
    }

    let message = body?.message;
    let doc = message?.document;
    let photo = message?.photo;
    let chat_id = message?.chat.id;
    let text = message?.text;
    let username = message?.chat?.username;
    let first_name = message?.chat?.first_name;

    if (!message) {
      adminChatId.forEach(async (chat_id) => {
        await sendMessage({
          chat_id,
          text: 'Null message data',
        });
      });

      return res.send();
    }

    console.log(message);

    if (doc || photo) {
      await sendMessage({
        chat_id,
        text: responseMessages.incorrect,
      });

      return res.send();
    }

    if (text === '/start') {
      await sendMessage({
        chat_id,
        text: responseMessages.welcome,
        reply_markup: {
          resize_keyboard: true,
          keyboard: [['⚓️ Input Link'], ['💰 Donation', '🤠 Support']],
        },
      });

      // check user from db
      let { data: getUser, error: getUserError } = await db.getUser({ chat_id });

      console.log({ getUser, getUserError });

      if (!getUser.length) {
        let { data: addUser, error: addUserError } = await db.addUser({
          chat_id,
          username,
          first_name,
        });

        adminChatId.forEach(async (chat_id) => {
          await sendMessage({
            chat_id,
            text: `\nNew user added \nUsername: ${username}\nFirst name: ${first_name}\nChat id: ${chat_id}`,
          });
        });
      } else if (getUserError) {
        adminChatId.forEach(async (chat_id) => {
          await sendMessage({
            chat_id,
            text: getUserError,
          });
        });
      }

      return res.send();
    }

    if (text === '🤠 Support') {
      await sendMessage({
        chat_id,
        text: responseMessages.support,
      });

      return res.send();
    }

    if (text === '⚓️ Input Link') {
      await sendMessage({
        chat_id,
        text: responseMessages.inputLink,
      });

      return res.send();
    }

    if (text === '💰 Donation') {
      await sendMessage({
        chat_id,
        text: responseMessages.donation,
      });

      return res.send();
    }

    let entities = message?.entities;
    if (entities && (entities[0]?.type === 'url' || entities[0]?.type === 'text_link')) {
      // check len link msg
      if (message?.entities.length > 1) {
        await sendMessage({
          chat_id,
          reply_to_message_id: message.message_id,
          text: 'Please enter the links one by one',
        });

        return res.send();
      }

      // wait messsage
      let { message_id } = await sendMessage({
        chat_id,
        reply_to_message_id: message.message_id,
        text: responseMessages.wait,
      });

      let document;
      let errorMsg;

      if (text.includes('https://doi.org') || text.includes('http://doi.org')) {
        const { data, error } = await getFile(text);
        document = data;
        errorMsg = error;
      } else if (text.includes('doi.org') && !text.includes('http')) {
        let textSplit = text.split('doi.org');
        let linkTarget = 'https://doi.org' + textSplit[textSplit.length - 1];
        console.log({ textSplit });
        console.log({ linkTarget });
        const { data, error } = await getFile(linkTarget);
        document = data;
        errorMsg = error;
      } else {
        // get doi from url
        let { data: metaDOIdata, error: metaDOIerror } = await getMetaDOI(text);

        console.log({ metaDOIdata, metaDOIerror });

        if (metaDOIerror) {
          document = null;
          errorMsg = metaDOIerror;
        } else {
          // get file
          const { data, error } = await getFile(metaDOIdata);
          document = data;
          errorMsg = error;
        }
      }

      await deleteMessage({ chat_id, message_id });

      if (!errorMsg) {
        await sendFile({
          document,
          chat_id,
          name: `${text}.pdf`,
          message_id: message.message_id,
        });
      } else {
        await sendMessage({
          chat_id,
          reply_to_message_id: message.message_id,
          text: errorMsg,
        });
      }

      return res.send();
    }

    await sendMessage({
      chat_id,
      text: responseMessages.incorrect,
    });
  } catch (err) {
    console.log({ err });

    adminChatId.forEach(async (chat_id) => {
      await sendMessage({
        chat_id,
        text: err,
      });
    });
  } finally {
    return res.send();
  }
};
