FROM node:18-slim

# Установка системных зависимостей для Chrome
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libdrm2 libgtk-3-0 libnspr4 libnss3 libx11-xcb1 libxtst6 \
    xdg-utils libatspi2.0-0 libxss1 && \
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Копирование package.json и установка зависимостей
COPY package*.json ./
RUN npm install

# Копирование исходного кода
COPY . .

# Создание директории для сессий
RUN mkdir -p sessions

# Порт Railway
EXPOSE $PORT

CMD ["node", "server.js"]
