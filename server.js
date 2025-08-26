const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// Global variables
let browser = null;
let page = null;
let isAuthenticated = false;
let messagesSent = 0;
let sessionActive = false;

// Configuration
const CONFIG = {
    LOGIN_URL: 'https://web.telegram.org/k/',
    DELAY_MIN: parseInt(process.env.DELAY_MIN) || 30000,
    DELAY_MAX: parseInt(process.env.DELAY_MAX) || 90000,
    MAX_PER_SESSION: parseInt(process.env.MAX_PER_SESSION) || 20,
    CHROME_PATH: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    MAX_RETRIES: 3,
    TIMEOUT: 30000
};

// Utility functions
function getRandomDelay() {
    return Math.floor(Math.random() * (CONFIG.DELAY_MAX - CONFIG.DELAY_MIN + 1)) + CONFIG.DELAY_MIN;
}

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Browser initialization
async function initBrowser() {
    try {
        if (browser) {
            await browser.close();
        }

        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows'
            ],
            executablePath: CONFIG.CHROME_PATH
        });

        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1366, height: 768 });
        
        log('Browser initialized successfully');
        return true;
    } catch (error) {
        log(`Error initializing browser: ${error.message}`);
        return false;
    }
}

// Authentication functions
async function checkAuthentication() {
    try {
        if (!page) {
            throw new Error('Browser not initialized');
        }

        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
        await sleep(3000);

        // Check if already logged in
        const loginForm = await page.$('.login-wrapper');
        if (!loginForm) {
            isAuthenticated = true;
            log('Already authenticated');
            return { success: true, authenticated: true };
        }

        isAuthenticated = false;
        return { success: true, authenticated: false, message: 'Authentication required' };
    } catch (error) {
        log(`Authentication check failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Message sending functions
async function waitForElement(selector, timeout = CONFIG.TIMEOUT) {
    try {
        await page.waitForSelector(selector, { timeout });
        return true;
    } catch (error) {
        log(`Element ${selector} not found within ${timeout}ms`);
        return false;
    }
}

async function sendSingleMessage(username, message) {
    try {
        if (!isAuthenticated) {
            throw new Error('Not authenticated');
        }

        log(`Sending message to ${username}`);

        // Search for user
        const searchSelector = '.input-search input';
        if (!(await waitForElement(searchSelector))) {
            throw new Error('Search input not found');
        }

        await page.click(searchSelector);
        await page.keyboard.type(username, { delay: 100 });
        await sleep(2000);

        // Click on first result
        const firstResult = '.chatlist-chat';
        if (!(await waitForElement(firstResult))) {
            throw new Error(`User ${username} not found`);
        }

        await page.click(firstResult);
        await sleep(2000);

        // Type message
        const messageInput = '.input-message-input';
        if (!(await waitForElement(messageInput))) {
            throw new Error('Message input not found');
        }

        await page.click(messageInput);
        await page.keyboard.type(message, { delay: 50 });
        await sleep(1000);

        // Send message
        const sendButton = '.btn-send';
        if (!(await waitForElement(sendButton))) {
            throw new Error('Send button not found');
        }

        await page.click(sendButton);
        await sleep(2000);

        messagesSent++;
        log(`Message sent to ${username}. Total sent: ${messagesSent}`);

        return { success: true, username, messagesSent };
    } catch (error) {
        log(`Error sending message to ${username}: ${error.message}`);
        return { success: false, username, error: error.message };
    }
}

async function sendBulkMessages(recipients, message) {
    const results = [];
    sessionActive = true;
    
    try {
        for (let i = 0; i < recipients.length && i < CONFIG.MAX_PER_SESSION; i++) {
            if (!sessionActive) {
                log('Session stopped by user');
                break;
            }

            const username = recipients[i];
            const result = await sendSingleMessage(username, message);
            results.push(result);

            // Add delay between messages
            if (i < recipients.length - 1) {
                const delay = getRandomDelay();
                log(`Waiting ${delay}ms before next message...`);
                await sleep(delay);
            }
        }
    } catch (error) {
        log(`Bulk messaging error: ${error.message}`);
    } finally {
        sessionActive = false;
    }

    return results;
}

// API Endpoints
app.get('/', (req, res) => {
    res.json({
        service: 'Telegram First Message Bot',
        version: '2.0.0',
        status: 'running',
        endpoints: {
            'GET /status': 'Service status',
            'POST /auth': 'Check authentication',
            'POST /send-message': 'Send single message',
            'POST /send-bulk': 'Send bulk messages',
            'POST /stop-session': 'Stop active session'
        },
        authenticated: isAuthenticated,
        messagesSent: messagesSent,
        sessionActive: sessionActive
    });
});

app.get('/status', (req, res) => {
    res.json({
        authenticated: isAuthenticated,
        messagesSent: messagesSent,
        sessionActive: sessionActive,
        maxPerSession: CONFIG.MAX_PER_SESSION,
        delayRange: `${CONFIG.DELAY_MIN}-${CONFIG.DELAY_MAX}ms`
    });
});

app.post('/auth', async (req, res) => {
    try {
        if (!browser) {
            const browserInit = await initBrowser();
            if (!browserInit) {
                return res.status(500).json({ error: 'Failed to initialize browser' });
            }
        }

        const authResult = await checkAuthentication();
        res.json(authResult);
    } catch (error) {
        log(`Auth endpoint error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/send-message', async (req, res) => {
    try {
        const { username, message } = req.body;

        if (!username || !message) {
            return res.status(400).json({ error: 'Username and message are required' });
        }

        if (!isAuthenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const result = await sendSingleMessage(username, message);
        res.json(result);
    } catch (error) {
        log(`Send message endpoint error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/send-bulk', async (req, res) => {
    try {
        const { recipients, message } = req.body;

        if (!recipients || !Array.isArray(recipients) || !message) {
            return res.status(400).json({ error: 'Recipients array and message are required' });
        }

        if (!isAuthenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        if (sessionActive) {
            return res.status(409).json({ error: 'Session already active' });
        }

        const results = await sendBulkMessages(recipients, message);
        res.json({
            success: true,
            results: results,
            totalProcessed: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        });
    } catch (error) {
        log(`Bulk send endpoint error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

app.post('/stop-session', (req, res) => {
    sessionActive = false;
    log('Session stop requested');
    res.json({ success: true, message: 'Session stopped' });
});

// Error handling middleware
app.use((error, req, res, next) => {
    log(`Unhandled error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    log('Received SIGINT, shutting down gracefully...');
    sessionActive = false;
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('Received SIGTERM, shutting down gracefully...');
    sessionActive = false;
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    log(`🚀 Telegram Bot server started on port ${PORT}`);
    log('Initializing browser...');
    await initBrowser();
});
