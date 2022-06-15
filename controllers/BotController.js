const { getFile, sendFile, sendMessage, deleteMessage } = require('../helpers');

let responseMessages = {
  welcome: 'Welcome to Sci-Hub Bot!',
  inputLink: `Send the reference link below`,
  wait: '🧑‍🍳 Searching your file...',
  incorrect: `Please send a valid DOI link below`,
  support: 'For any question or business inquiries please contact @x0code',
  donation:
    'Your support matters. This project survives on the kindness & generosity of your contributions.\n\n☕ https://www.buymeacoffee.com/x0code \n\nThankyou!',
};

module.exports = async (req, res) => {
  try {
    let body = req.body;

    if (body.my_chat_member) {
      await sendMessage({
        chat_id: 1392922267,
        text: `Bot has been deleted by ${body.my_chat_member.chat.id}`,
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
      await sendMessage({
        chat_id: 1392922267,
        text: 'Null message data',
      });

      return res.send();
    }

    if (doc || photo) {
      await sendMessage({
        chat_id,
        text: responseMessages.incorrect,
      });

      return res.send();
    }

    console.log(message);

    if (text === '/start') {
      await sendMessage({
        chat_id: 1392922267,
        text: `\nNew user added \nUsername: ${username}\nFirst name: ${first_name}\nChat id: ${chat_id}`,
      });

      await sendMessage({
        chat_id,
        text: responseMessages.welcome,
        reply_markup: {
          resize_keyboard: true,
          keyboard: [['⚓️ Input Link'], ['💰 Donation', '🤠 Support']],
        },
      });

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

    if (text.includes('https://doi.org') || text.includes('http://doi.org')) {
      console.log('URL INCLUDES DOI');

      let { message_id } = await sendMessage({
        chat_id,
        reply_to_message_id: message.message_id,
        text: responseMessages.wait,
      });

      const { data: document, error } = await getFile(text);

      await deleteMessage({ chat_id, message_id });

      if (!error) {
        await sendFile({ document, chat_id, name: `${text}.pdf`, message_id: message.message_id });
      } else {
        await sendMessage({
          chat_id,
          reply_to_message_id: message.message_id,
          text: error,
        });
      }
    } else {
      await sendMessage({
        chat_id,
        text: responseMessages.incorrect,
      });
    }
  } catch (err) {
    console.log({ err });
    await sendMessage({
      chat_id: 1392922267,
      text: `ERROR!! \n${err}`,
    });
  } finally {
    return res.send();
  }
};
