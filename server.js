const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Раздача статических файлов из папки 'public'
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Маршруты API
app.get('/api/hello', (req, res) => {
    res.json({ 
        message: 'API работает!',
        timestamp: new Date().toISOString()
    });
});

// Маршрут для корневой страницы
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>XT Team Site - Главная</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    max-width: 800px;
                    margin: 0 auto;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    color: white;
                }
                .container {
                    background: rgba(255, 255, 255, 0.1);
                    padding: 30px;
                    border-radius: 15px;
                    backdrop-filter: blur(10px);
                }
                h1 {
                    color: white;
                    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                }
                .status {
                    background: rgba(0, 255, 0, 0.2);
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .links a {
                    display: inline-block;
                    margin: 10px;
                    padding: 12px 24px;
                    background: white;
                    color: #764ba2;
                    text-decoration: none;
                    border-radius: 25px;
                    font-weight: bold;
                    transition: transform 0.3s;
                }
                .links a:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                .code {
                    background: rgba(0,0,0,0.3);
                    padding: 15px;
                    border-radius: 8px;
                    font-family: monospace;
                    margin: 15px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 XT Team Site работает!</h1>
                
                <div class="status">
                    <h2>✅ Сервер успешно запущен</h2>
                    <p><strong>Порт:</strong> ${PORT}</p>
                    <p><strong>Время:</strong> ${new Date().toLocaleString()}</p>
                </div>
                
                <div class="links">
                    <h3>Доступные ссылки:</h3>
                    <a href="/" target="_blank">Главная страница</a>
                    <a href="/api/hello" target="_blank">API тест</a>
                    <a href="./test.html" target="_blank">Тестовая страница</a>
                </div>
                
                <div class="code">
                    <h4>Проверьте в консоли:</h4>
                    <pre>curl http://localhost:${PORT}/api/hello</pre>
                    <p>Должен вернуть JSON с сообщением</p>
                </div>
                
                <h3>Следующие шаги:</h3>
                <ol>
                    <li>Создайте папку <strong>public</strong> и поместите туда ваши HTML/CSS файлы</li>
                    <li>Создайте файл <strong>public/index.html</strong> - он будет загружаться автоматически</li>
                    <li>Начните добавлять свои маршруты в server.js</li>
                </ol>
            </div>
        </body>
        </html>
    `);
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен: http://localhost:${PORT}`);
    console.log(`📁 Статические файлы: http://localhost:${PORT}/public/`);
    console.log(`🛠️  API тест: http://localhost:${PORT}/api/hello`);
    console.log(`🏠 Главная: http://localhost:${PORT}/`);
});