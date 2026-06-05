exports.responseMessages = {
  welcome: `
Welcome to Sci-Hub Bot! 📄

Drop a DOI or Publisher URL below to get your paper instantly. You can also search by keyword using the /kw command.

Use /help to see all input examples.

📢 Join @x0projects for updates & new bots
  `,

  help: `
<b>📖 How to use Sci-Hub Bot</b>

<b>[DOI-URL]</b>
<code>https://doi.org/10.1177/193229681300700321</code>

<b>[DOI-PATH]</b>
<code>10.1177/193229681300700321</code>
<code>DOI:10.1177/193229681300700321</code>

<b>[PUBLISHER URL]</b>
<code>https://www.nature.com/articles/laban.665</code>

<b>[KEYWORD SEARCH]</b>
<code>/kw computer science</code>

<i>💡 Send a DOI or link and you'll see a paper info card with abstract, authors, and citations before downloading.</i>

📢 <b>Join <a href="https://t.me/x0projects">@x0projects</a></b> for updates & new bots
  `,

  inputLink: `Please drop a DOI or Publisher URL below, or you can search by keyword by using "/kw" command before the keyword you want to search for. Use the /help command to find out more.`,

  donation: `Your support matters. This project survives on the kindness & generosity of your contributions.

[KO-FI]
https://ko-fi.com/aldimhr

[ETH] [BNB]
0xC4cB89575A39Cb1A7066BB855B4FdA5Ce3cEE64a

[BTC]
bc1q3hg8p8sg54vade6fl02y55vlcqu2zyw4h93vc0

Thankyou!`,
  support: 'For any question or business inquiries please contact @x0codd',
  wait: '🕵‍♀️ Searching your file...',
  null: 'null message',
};

exports.keyboardMessage = {
  default: [['⚓️ Search Document'], ['📢 Channel', '💰 Donate', '🤠 Support']],
};

exports.adminChatId = [519613720, 1392922267];
