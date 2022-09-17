exports.responseMessages = {
  welcome: `
Welcome to Sci-Hub Bot!

How does this bot work? Drop a DOI or Publisher URL below, or you can search by keyword by using "/kw" command before the keyword you want to search for. Use the /help command to find out more.

Developed by: @x0projects
  `,

  help: `
This bot accepts several types of input, including DOI-URL, DOI-path, publisher, and searches files by keyword. Below is an example of the input that bots can accept

[DOI-URL]
https://doi.org/10.1177/193229681300700321

[DOI-PATH]
10.1177/193229681300700321
DOI:10.1177/193229681300700321
DOI 10.1177/193229681300700321

[PUBLISHER]
https://www.nature.com/articles/laban.665

[KEYWORD]
/kw computer science

<i>Note: add '/kw' before the keyword you want to search, this is mandatory if you want to search papers by keyword</i>
  `,

  inputLink: `Please drop a DOI or Publisher URL below, or you can search by keyword by using "/kw" command before the keyword you want to search for. Use the /help command to find out more.`,

  donation: `Your support matters. This project survives on the kindness & generosity of your contributions.

[ETH] [BNB]
0xC4cB89575A39Cb1A7066BB855B4FdA5Ce3cEE64a

[BTC]
bc1q3hg8p8sg54vade6fl02y55vlcqu2zyw4h93vc0

Thankyou!`,
  support: 'For any question or business inquiries please contact @x0code',
  wait: '🕵‍♀️ Searching your file...',
  null: 'null message',
};

exports.keyboardMessage = {
  default: [['⚓️ Search Document'], ['💰 Donation', '🤠 Support']],
};

exports.adminChatId = [519613720, 1392922267];
