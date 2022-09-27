# Sci-Hub TELEGRAM BOT

Quoted from the [Sci-Hub website](https://sci-hub.se/) "The goal of Sci-Hub is to provide free and unrestricted access to all scientific knowledge ever published in a journal or book form."

In line with the goals of Sci-Hub, this bot was created to make it easier for everyone to download paid publications.

## Instalation

```bash
pnpm install
```

## Development

Build command

```bash
pnpm build
```

Development command

```bash
pnpm dev
```

---

**_note:_**

- development command uses Nodemon, make sure you install it
- uncomment bot.launch(); in bot.js before running it locally

---

## To-Do

- [ ] Fixing "search article by keyword" (not working on AWS)
- [x] Auto download if response is PDF binary
- [x] Fixing "search article by publisher link"
- [x] Looking for an alternative to Heroku (currently using AWS)
- [x] Looking for an alternative to JSDOM (currently using node-html-parser)
