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

// Настройка сессий для Render
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'xtteam-secret-key-2025',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    }
};

// Настройка proxy для HTTPS на Render
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    sessionConfig.cookie.secure = true;
    sessionConfig.cookie.sameSite = 'none';
    sessionConfig.proxy = true;
}

app.use(session(sessionConfig));

// Определяем корневую директорию
const rootDir = process.env.NODE_ENV === 'production' 
    ? __dirname  // На Render всё в одной директории
    : __dirname;

console.log('Root directory:', rootDir);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Статические файлы
app.use(express.static(rootDir)); // Основная директория
app.use('/images', express.static(path.join(rootDir, 'images')));
app.use('/fonts', express.static(path.join(rootDir, 'fonts')));

// Проверяем существование файлов
const checkFileExists = (filePath) => {
    const fullPath = path.join(rootDir, filePath);
    console.log(`Checking file: ${filePath} -> ${fullPath}`);
    return fs.existsSync(fullPath);
};

// CORS для Render
app.use((req, res, next) => {
    const allowedOrigins = [
        `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`,
        'http://localhost:3000',
        'http://localhost:' + PORT
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    next();
});

// Middleware для проверки авторизации
const authMiddleware = (req, res, next) => {
    console.log('Session check:', {
        sessionId: req.sessionID,
        userId: req.session.userId,
        username: req.session.username
    });
    next();
};

app.use(authMiddleware);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const status = await db.checkDatabaseStatus();
        res.json({
            success: true,
            session: req.sessionID ? 'active' : 'none',
            userId: req.session.userId || 'none',
            username: req.session.username || 'none',
            database: 'PostgreSQL',
            status: status,
            rootDir: rootDir,
            files: {
                index: checkFileExists('index.html'),
                profile: checkFileExists('profile.html'),
                server: checkFileExists('server.js')
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed'
        });
    }
});

// Session debug endpoint
app.get('/api/debug-session', (req, res) => {
    res.json({
        sessionId: req.sessionID,
        userId: req.session.userId,
        username: req.session.username,
        cookie: req.headers.cookie,
        rootDir: rootDir
    });
});

// ... остальные API эндпоинты (register, login, logout, achievements) остаются без изменений ...
// (Используйте код из предыдущего ответа для этих эндпоинтов)

// API: Register (ENGLISH ONLY)
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }
        
        if (username.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Username must be at least 3 characters'
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 6 characters'
            });
        }
        
        // Email validation
        let cleanEmail = null;
        if (email && email.trim() !== '') {
            cleanEmail = email.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(cleanEmail)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid email format'
                });
            }
        }
        
        // Check if user exists
        const existingUser = await db.getUserByUsername(username);
        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Username already taken'
            });
        }
        
        // Create user
        const userId = await db.createUser(username, password, cleanEmail);
        
        // Set session
        req.session.userId = userId;
        req.session.username = username;
        
        console.log(`✅ User registered: ${username} (ID: ${userId})`);
        
        // Unlock registration achievement
        await db.unlockAchievement(userId, "With Registration!");
        
        res.json({
            success: true,
            user: {
                id: userId,
                username: username
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        
        let errorMessage = 'Internal server error';
        
        if (error.message && error.message.includes('duplicate key')) {
            if (error.message.includes('email')) {
                errorMessage = 'Email already registered';
            } else if (error.message.includes('username')) {
                errorMessage = 'Username already taken';
            }
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage
        });
    }
});

// API: Login (ENGLISH ONLY)
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password are required'
            });
        }
        
        // Verify user
        const isValid = await db.verifyUser(username, password);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
        }
        
        // Get user
        const user = await db.getUserByUsername(username);
        
        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        
        console.log(`✅ User logged in: ${username} (ID: ${user.id})`);
        
        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// API: Logout
app.post('/api/logout', (req, res) => {
    const username = req.session.username;
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }
        
        res.clearCookie('connect.sid');
        console.log(`✅ User logged out: ${username}`);
        res.json({
            success: true
        });
    });
});

// API: Get user achievements
app.get('/api/achievements', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        let achievements = [];
        let user = null;
        
        if (userId) {
            achievements = await db.getUserAchievements(userId);
            user = await db.getUserById(userId);
            console.log(`✅ Achievements loaded for user ${userId}: ${achievements.length} achievements`);
        } else {
            // If not authenticated, show all achievements as locked
            const allAchievements = await db.getAllAchievements();
            achievements = allAchievements.map(a => ({
                ...a,
                unlocked: false
            }));
            console.log(`✅ Achievements loaded for guest: ${achievements.length} achievements`);
        }
        
        res.json({
            success: true,
            achievements: achievements,
            user: user
        });
        
    } catch (error) {
        console.error('Achievements error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load achievements'
        });
    }
});

// API: Unlock achievement
app.post('/api/unlock-achievement', async (req, res) => {
    try {
        const userId = req.session.userId;
        const { achievementName } = req.body;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        
        if (!achievementName) {
            return res.status(400).json({
                success: false,
                error: 'Achievement name is required'
            });
        }
        
        const unlocked = await db.unlockAchievement(userId, achievementName);
        
        console.log(`🔓 Achievement "${achievementName}" ${unlocked ? 'unlocked' : 'already unlocked'} for user ${userId}`);
        
        res.json({
            success: unlocked,
            message: unlocked ? 'Achievement unlocked!' : 'Achievement already unlocked'
        });
        
    } catch (error) {
        console.error('Unlock achievement error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unlock achievement'
        });
    }
});

// API: Get current user info
app.get('/api/me', async (req, res) => {
    try {
        const userId = req.session.userId;
        
        console.log('API /me called - Session:', {
            sessionId: req.sessionID,
            userId: userId,
            username: req.session.username
        });
        
        if (!userId) {
            return res.json({
                authenticated: false
            });
        }
        
        const user = await db.getUserById(userId);
        
        if (!user) {
            req.session.destroy();
            return res.json({
                authenticated: false
            });
        }
        
        res.json({
            authenticated: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email || ''
            }
        });
        
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Маршруты для HTML страниц (ИСПРАВЛЕННЫЕ ПУТИ)
app.get('/', (req, res) => {
    const indexPath = path.join(rootDir, 'index.html');
    console.log('Serving index.html from:', indexPath);
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Fallback
        res.status(404).send('<h1>index.html not found</h1><p>Looking in: ' + indexPath + '</p>');
    }
});

app.get('/profile', (req, res) => {
    const profilePath = path.join(rootDir, 'profile.html');
    console.log('Serving profile.html from:', profilePath);
    
    if (fs.existsSync(profilePath)) {
        res.sendFile(profilePath);
    } else {
        res.redirect('/');
    }
});

app.get('/games', (req, res) => {
    // Пробуем несколько возможных путей
    const possiblePaths = [
        path.join(rootDir, 'games.html'),
        path.join(rootDir, 'games', 'games.html'),
        path.join(rootDir, 'games/games.html')
    ];
    
    for (const gamePath of possiblePaths) {
        console.log('Checking games at:', gamePath);
        if (fs.existsSync(gamePath)) {
            console.log('Found games at:', gamePath);
            return res.sendFile(gamePath);
        }
    }
    
    // Если не нашли - редирект на главную
    console.log('Games page not found, redirecting to /');
    res.redirect('/');
});

app.get('/about', (req, res) => {
    // Пробуем несколько возможных путей
    const possiblePaths = [
        path.join(rootDir, 'about.html'),
        path.join(rootDir, 'aboutUs.html'),
        path.join(rootDir, 'aboutUs', 'aboutUs.html'),
        path.join(rootDir, 'aboutUs/aboutUs.html')
    ];
    
    for (const aboutPath of possiblePaths) {
        console.log('Checking about at:', aboutPath);
        if (fs.existsSync(aboutPath)) {
            console.log('Found about at:', aboutPath);
            return res.sendFile(aboutPath);
        }
    }
    
    // Если не нашли - редирект на главную
    console.log('About page not found, redirecting to /');
    res.redirect('/');
});

// Статические файлы для подпапок
app.get('/games/games.html', (req, res) => {
    const gamePath = path.join(rootDir, 'games', 'games.html');
    if (fs.existsSync(gamePath)) {
        res.sendFile(gamePath);
    } else {
        res.redirect('/');
    }
});

app.get('/aboutUs/aboutUs.html', (req, res) => {
    const aboutPath = path.join(rootDir, 'aboutUs', 'aboutUs.html');
    if (fs.existsSync(aboutPath)) {
        res.sendFile(aboutPath);
    } else {
        res.redirect('/');
    }
});

// Fallback for all other routes
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        // Пробуем найти файл
        const filePath = path.join(rootDir, req.path);
        if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
            res.sendFile(filePath);
        } else {
            // Редирект на главную
            res.redirect('/');
        }
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Database: PostgreSQL`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📁 Root directory: ${rootDir}`);
    
    // Проверяем существование ключевых файлов
    console.log('\n📋 File check:');
    const filesToCheck = ['index.html', 'profile.html', 'server.js', 'package.json'];
    filesToCheck.forEach(file => {
        const filePath = path.join(rootDir, file);
        const exists = fs.existsSync(filePath);
        console.log(`  ${exists ? '✅' : '❌'} ${file} - ${exists ? 'Found' : 'Missing'}`);
    });
});