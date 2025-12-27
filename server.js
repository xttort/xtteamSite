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

// Определяем пути
const rootDir = __dirname; // Папка где server.js
const publicDir = path.join(rootDir, 'public'); // Папка public с HTML

console.log('🚀 Server starting...');
console.log('📁 Root directory:', rootDir);
console.log('📁 Public directory:', publicDir);
console.log('🌍 NODE_ENV:', process.env.NODE_ENV);

// Проверяем существование папки public
if (!fs.existsSync(publicDir)) {
    console.error('❌ ERROR: public directory not found at:', publicDir);
    console.error('Creating public directory...');
    fs.mkdirSync(publicDir, { recursive: true });
}

// Статические файлы из папки public
app.use(express.static(publicDir));

// Статические файлы из подпапок
app.use('/images', express.static(path.join(publicDir, 'images')));
app.use('/fonts', express.static(path.join(publicDir, 'fonts')));

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
    if (req.path.startsWith('/api/')) {
        console.log('🔐 API Request:', {
            path: req.path,
            userId: req.session.userId,
            username: req.session.username
        });
    }
    next();
};

app.use(authMiddleware);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const status = await db.checkDatabaseStatus();
        
        // Проверяем ключевые файлы
        const keyFiles = {
            'public/index.html': path.join(publicDir, 'index.html'),
            'public/profile.html': path.join(publicDir, 'profile.html'),
            'server.js': path.join(rootDir, 'server.js'),
            'db.js': path.join(rootDir, 'db.js')
        };
        
        const fileStatus = {};
        for (const [name, filePath] of Object.entries(keyFiles)) {
            fileStatus[name] = fs.existsSync(filePath);
        }
        
        res.json({
            success: true,
            session: {
                id: req.sessionID,
                userId: req.session.userId,
                username: req.session.username
            },
            database: status,
            directories: {
                root: rootDir,
                public: publicDir,
                exists: fs.existsSync(publicDir)
            },
            files: fileStatus,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({
            success: false,
            error: 'Database connection failed',
            details: error.message
        });
    }
});

// API: Register
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

// API: Login
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
        
        if (!userId) {
            return res.json({
                authenticated: false,
                message: 'Not authenticated'
            });
        }
        
        const user = await db.getUserById(userId);
        
        if (!user) {
            req.session.destroy();
            return res.json({
                authenticated: false,
                message: 'User not found'
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

// Маршруты для HTML страниц - ВСЕ ИЗ ПАПКИ public
app.get('/', (req, res) => {
    const indexPath = path.join(publicDir, 'index.html');
    console.log('📄 Serving index.html from:', indexPath);
    
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <h1>Error: index.html not found</h1>
            <p>Expected at: ${indexPath}</p>
            <p>Current directory: ${__dirname}</p>
        `);
    }
});

app.get('/profile', (req, res) => {
    const profilePath = path.join(publicDir, 'profile.html');
    console.log('👤 Serving profile.html from:', profilePath);
    
    if (fs.existsSync(profilePath)) {
        res.sendFile(profilePath);
    } else {
        console.log('Profile not found, redirecting to /');
        res.redirect('/');
    }
});

app.get('/games', (req, res) => {
    const gamesPath = path.join(publicDir, 'games', 'games.html');
    console.log('🎮 Serving games.html from:', gamesPath);
    
    if (fs.existsSync(gamesPath)) {
        res.sendFile(gamesPath);
    } else {
        // Альтернативный путь
        const altPath = path.join(publicDir, 'games.html');
        if (fs.existsSync(altPath)) {
            res.sendFile(altPath);
        } else {
            console.log('Games not found, redirecting to /');
            res.redirect('/');
        }
    }
});

app.get('/about', (req, res) => {
    const aboutPath = path.join(publicDir, 'aboutUs', 'aboutUs.html');
    console.log('👥 Serving aboutUs.html from:', aboutPath);
    
    if (fs.existsSync(aboutPath)) {
        res.sendFile(aboutPath);
    } else {
        // Альтернативный путь
        const altPath = path.join(publicDir, 'aboutUs.html');
        if (fs.existsSync(altPath)) {
            res.sendFile(altPath);
        } else {
            console.log('About not found, redirecting to /');
            res.redirect('/');
        }
    }
});

// Прямые маршруты для ссылок
app.get('/games/games.html', (req, res) => {
    res.redirect('/games');
});

app.get('/aboutUs/aboutUs.html', (req, res) => {
    res.redirect('/about');
});

// Fallback для API
app.get('/api/*', (req, res) => {
    res.status(404).json({ 
        error: 'API endpoint not found',
        path: req.path 
    });
});

// Fallback для всех других маршрутов - пробуем найти файл в public
app.get('*', (req, res) => {
    const requestedPath = req.path;
    
    // Пробуем найти файл в public
    const filePath = path.join(publicDir, requestedPath);
    
    if (fs.existsSync(filePath) && !fs.lstatSync(filePath).isDirectory()) {
        console.log(`📄 Serving static file: ${requestedPath}`);
        res.sendFile(filePath);
    } else {
        // Редирект на главную
        console.log(`🔀 Route not found: ${requestedPath}, redirecting to /`);
        res.redirect('/');
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`🌐 Access: http://localhost:${PORT}`);
    console.log(`📊 Database: PostgreSQL`);
    
    // Проверяем ключевые файлы
    console.log('\n📋 File system check:');
    
    const checkPaths = [
        { name: 'public/index.html', path: path.join(publicDir, 'index.html') },
        { name: 'public/profile.html', path: path.join(publicDir, 'profile.html') },
        { name: 'public/games/games.html', path: path.join(publicDir, 'games', 'games.html') },
        { name: 'public/aboutUs/aboutUs.html', path: path.join(publicDir, 'aboutUs', 'aboutUs.html') },
        { name: 'server.js', path: path.join(rootDir, 'server.js') },
        { name: 'db.js', path: path.join(rootDir, 'db.js') }
    ];
    
    checkPaths.forEach(item => {
        const exists = fs.existsSync(item.path);
        console.log(`  ${exists ? '✅' : '❌'} ${item.name}`);
    });
    
    console.log('\n🚀 Server is ready!');
});