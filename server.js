const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

let browser = null;
let page = null;
let isAuthenticated = false;

const CONFIG = {
    LOGIN_URL: 'https://web.telegram.org/k/',
    DELAY_MIN: parseInt(process.env.DELAY_MIN) || 30000,
    DELAY_MAX: parseInt(process.env.DELAY_MAX) || 90000,  
    MAX_PER_SESSION: parseInt(process.env.MAX_PER_SESSION) || 20,
    CHROME_PATH: '/usr/bin/google-chrome'
};

let messagesSent = 0;
let sessionActive = false;

// Основные функции и routes будут добавлены в следующих файлах

// Главная страница
app.get('/', (req, res) => {
    res.json({
        service: 'Telegram First Message Bot',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            'GET /status': 'Статус сервиса',
            'POST /auth': 'Проверка авторизации',
            'POST /send-message': 'Одночное сообщение',
            'POST /send-bulk': 'Массовая рассылка'
        },
        authentication_required: !isAuthenticated
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Telegram Bot запущен на порту ${PORT}`);
});
