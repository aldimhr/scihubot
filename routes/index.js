const express = require('express');
const router = express.Router();

const BotController = require('../controllers/BotController');

const { BOT_TOKEN } = process.env;
const URI = `/webhook/${BOT_TOKEN}`;

router.use(URI, BotController);

module.exports = router;
