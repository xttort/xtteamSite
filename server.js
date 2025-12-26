const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const db = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'xtteam-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 часа
    }
}));

// Статические файлы из разных директорий
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'games')));
app.use(express.static(path.join(__dirname, 'aboutUs')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

// Middleware для проверки авторизации
app.use((req, res, next) => {
    if (req.session.userId) {
        req.userId = req.session.userId;
        req.username = req.session.username;
    }
    next();
});

// API эндпоинты

// Регистрация
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Имя пользователя и пароль обязательны'
            });
        }
        
        if (username.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Имя пользователя должно быть не менее 3 символов'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Пароль должен быть не менее 6 символов'
            });
        }
        
        // Обработка email: если пустая строка или не указан - делаем null
        let cleanEmail = null;
        if (email && email.trim() !== '') {
            cleanEmail = email.trim();
            // Проверяем формат email
            if (!isValidEmail(cleanEmail)) {
                return res.status(400).json({
                    success: false,
                    error: 'Неверный формат email'
                });
            }
        }
        
        // Проверяем, существует ли пользователь с таким username
        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Пользователь с таким именем уже существует'
            });
        }
        
        // Создаем пользователя
        const userId = await db.createUser(username, password, cleanEmail);
        
        req.session.userId = userId;
        req.session.username = username;
        
        // Автоматически разблокируем достижение за регистрацию
        await db.unlockAchievement(userId, "With Registration!");
        
        res.json({
            success: true,
            user: {
                id: userId,
                username: username
            }
        });
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        
        // Более информативные сообщения об ошибках
        let errorMessage = 'Внутренняя ошибка сервера';
        
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
            if (error.message.includes('email')) {
                errorMessage = 'Пользователь с таким email уже существует';
            } else if (error.message.includes('username')) {
                errorMessage = 'Пользователь с таким именем уже существует';
            }
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});

// Функция проверки email
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Вход
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Имя пользователя и пароль обязательны'
            });
        }
        
        // Проверяем пользователя
        const isValid = await db.verifyUser(username, password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Неверное имя пользователя или пароль'
            });
        }
        
        // Получаем пользователя
        const user = await db.getUserByUsername(username);
        
        req.session.userId = user.id;
        req.session.username = user.username;
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username
            }
        });
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Ошибка выхода:', err);
            return res.status(500).json({
                success: false,
                error: 'Ошибка выхода из системы'
            });
        }
        
        res.clearCookie('connect.sid');
        res.json({
            success: true
        });
    });
});

// Получение достижений пользователя
app.get('/api/achievements', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        let achievements = [];
        let user = null;
        
        if (userId) {
            achievements = await db.getUserAchievements(userId);
            user = await db.getUserById(userId);
        } else {
            // Если пользователь не авторизован, показываем все достижения как заблокированные
            const allAchievements = await db.getAllAchievements();
            achievements = allAchievements.map(a => ({
                ...a,
                unlocked: 0
            }));
        }
        
        res.json({
            success: true,
            achievements: achievements,
            user: user
        });
        
    } catch (error) {
        console.error('Ошибка получения достижений:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Разблокировка достижения
app.post('/api/unlock-achievement', async (req, res) => {
    try {
        const userId = req.session.userId;
        const { achievementName } = req.body;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Необходима авторизация'
            });
        }
        
        if (!achievementName) {
            return res.status(400).json({
                success: false,
                error: 'Название достижения обязательно'
            });
        }
        
        const unlocked = await db.unlockAchievement(userId, achievementName);
        
        res.json({
            success: unlocked,
            message: unlocked ? 'Достижение разблокировано' : 'Достижение уже было разблокировано или не найдено'
        });
        
    } catch (error) {
        console.error('Ошибка разблокировки достижения:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Получение информации о текущем пользователе
app.get('/api/me', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        if (!userId) {
            return res.json({
                authenticated: false
            });
        }
        
        const user = await db.getUserById(userId);
        
        res.json({
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email || ''
            }
        });
        
    } catch (error) {
        console.error('Ошибка получения информации о пользователе:', error);
        res.status(500).json({
            success: false,
            error: 'Внутренняя ошибка сервера'
        });
    }
});

// Маршруты для HTML страниц

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Страница профиля
app.get('/profile', (req, res) => {
    const profilePath = path.join(__dirname, 'profile.html');
    
    if (fs.existsSync(profilePath)) {
        res.sendFile(profilePath);
    } else {
        // Пробуем найти в public
        const publicProfilePath = path.join(__dirname, 'public', 'profile.html');
        if (fs.existsSync(publicProfilePath)) {
            res.sendFile(publicProfilePath);
        } else {
            res.status(404).send('Страница профиля не найдена');
        }
    }
});

// Страница игр
app.get('/games', (req, res) => {
    const gamesPath = path.join(__dirname, 'games', 'games.html');
    if (fs.existsSync(gamesPath)) {
        res.sendFile(gamesPath);
    } else {
        res.status(404).send('Страница игр не найдена');
    }
});

// Страница "О нас"
app.get('/about', (req, res) => {
    const aboutPath = path.join(__dirname, 'aboutUs', 'aboutUs.html');
    if (fs.existsSync(aboutPath)) {
        res.sendFile(aboutPath);
    } else {
        res.status(404).send('Страница "О нас" не найдена');
    }
});

// Fallback для всех остальных маршрутов
app.get('*', (req, res) => {
    res.status(404).send('Страница не найдена');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📁 Корневая директория: ${__dirname}`);
});