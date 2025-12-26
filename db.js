const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

class Database {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { 
                rejectUnauthorized: false 
            } : false
        });
        
        console.log('✅ Подключение к PostgreSQL...');
        this.initTables();
    }

    async initTables() {
        const client = await this.pool.connect();
        try {
            // Таблица пользователей
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    email VARCHAR(100) UNIQUE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Таблица users создана/проверена');

            // Таблица достижений
            await client.query(`
                CREATE TABLE IF NOT EXISTS achievements (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description TEXT NOT NULL,
                    icon_path VARCHAR(255),
                    category VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Таблица achievements создана/проверена');

            // Таблица связей пользователь-достижение
            await client.query(`
                CREATE TABLE IF NOT EXISTS user_achievements (
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
                    unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, achievement_id)
                )
            `);
            console.log('✅ Таблица user_achievements создана/проверена');

            // Добавляем базовые достижения
            await this.initAchievements(client);
            
        } catch (error) {
            console.error('❌ Ошибка инициализации таблиц:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    async initAchievements(client) {
        const achievements = [
            {
                name: "Team Introduction",
                description: "Visited the 'About Us' section",
                icon_path: "team-icon",
                category: "about"
            },
            {
                name: "First News",
                description: "Scrolled to the first news article",
                icon_path: "news-icon",
                category: "news"
            },
            {
                name: "Game Observer",
                description: "Visited games section",
                icon_path: "games-icon",
                category: "games"
            },
            {
                name: "GameR",
                description: "Clicked download button on all available games",
                icon_path: "gamer-icon",
                category: "games"
            },
            {
                name: "With Registration!",
                description: "Successfully registered an account",
                icon_path: "registration-icon",
                category: "account"
            },
            {
                name: "Curious",
                description: "Hovered mouse over all tiles on homepage",
                icon_path: "curious-icon",
                category: "main"
            },
            {
                name: "Letter to Developer",
                description: "Sent an email to a developer",
                icon_path: "mail-icon",
                category: "contact"
            },
            {
                name: "YouTube Subscriber",
                description: "Visited developer's YouTube channel",
                icon_path: "youtube-icon",
                category: "contact"
            }
        ];

        try {
            // Проверяем, есть ли уже достижения
            const result = await client.query('SELECT COUNT(*) as count FROM achievements');
            const count = parseInt(result.rows[0].count);
            
            if (count === 0) {
                console.log('Добавляем базовые достижения...');
                
                for (const achievement of achievements) {
                    await client.query(
                        'INSERT INTO achievements (name, description, icon_path, category) VALUES ($1, $2, $3, $4)',
                        [achievement.name, achievement.description, achievement.icon_path, achievement.category]
                    );
                }
                console.log('✅ Базовые достижения добавлены');
            } else {
                console.log(`✅ В базе уже есть ${count} достижений`);
            }
        } catch (error) {
            console.error('❌ Ошибка при добавлении достижений:', error);
        }
    }

    // Методы для пользователей
    async createUser(username, password, email = null) {
        const client = await this.pool.connect();
        try {
            const passwordHash = await bcrypt.hash(password, 10);
            
            const result = await client.query(
                'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id',
                [username, passwordHash, email]
            );
            
            return result.rows[0].id;
        } finally {
            client.release();
        }
    }

    async getUserByUsername(username) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM users WHERE username = $1',
                [username]
            );
            
            return result.rows[0] || null;
        } finally {
            client.release();
        }
    }

    async verifyUser(username, password) {
        const user = await this.getUserByUsername(username);
        if (!user) return false;
        
        return await bcrypt.compare(password, user.password_hash);
    }

    // Методы для достижений
    async addAchievement(achievement) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'INSERT INTO achievements (name, description, icon_path, category) VALUES ($1, $2, $3, $4) RETURNING id',
                [achievement.name, achievement.description, achievement.icon_path, achievement.category]
            );
            
            return result.rows[0].id;
        } finally {
            client.release();
        }
    }

    async unlockAchievement(userId, achievementName) {
        const client = await this.pool.connect();
        try {
            // Находим достижение
            const achievementResult = await client.query(
                'SELECT id FROM achievements WHERE name = $1',
                [achievementName]
            );
            
            if (achievementResult.rows.length === 0) {
                console.log(`Достижение "${achievementName}" не найдено`);
                return false;
            }
            
            const achievementId = achievementResult.rows[0].id;
            
            // Проверяем, не разблокировано ли уже
            const checkResult = await client.query(
                'SELECT 1 FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
                [userId, achievementId]
            );
            
            if (checkResult.rows.length > 0) {
                console.log(`Достижение "${achievementName}" уже разблокировано у пользователя ${userId}`);
                return false;
            }
            
            // Разблокируем
            await client.query(
                'INSERT INTO user_achievements (user_id, achievement_id) VALUES ($1, $2)',
                [userId, achievementId]
            );
            
            console.log(`🏆 Достижение "${achievementName}" разблокировано для пользователя ${userId}`);
            return true;
            
        } catch (error) {
            console.error('Ошибка разблокировки достижения:', error);
            return false;
        } finally {
            client.release();
        }
    }

    async getUserAchievements(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT a.*, 
                       CASE WHEN ua.user_id IS NOT NULL THEN true ELSE false END as unlocked
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = $1
                ORDER BY a.category, a.id
            `, [userId]);
            
            return result.rows;
        } finally {
            client.release();
        }
    }

    async getUserById(userId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT id, username, email, created_at FROM users WHERE id = $1',
                [userId]
            );
            
            return result.rows[0] || null;
        } finally {
            client.release();
        }
    }

    async getAllAchievements() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM achievements ORDER BY category, id'
            );
            
            return result.rows;
        } finally {
            client.release();
        }
    }

    // Метод для проверки состояния БД
    async checkDatabaseStatus() {
        const client = await this.pool.connect();
        try {
            const usersResult = await client.query('SELECT COUNT(*) as user_count FROM users');
            const achievementsResult = await client.query('SELECT COUNT(*) as achievement_count FROM achievements');
            const userAchievementsResult = await client.query('SELECT COUNT(*) as user_achievement_count FROM user_achievements');
            
            return {
                users: parseInt(usersResult.rows[0].user_count),
                achievements: parseInt(achievementsResult.rows[0].achievement_count),
                user_achievements: parseInt(userAchievementsResult.rows[0].user_achievement_count),
                status: 'OK'
            };
        } finally {
            client.release();
        }
    }

    // Закрытие соединения
    async close() {
        await this.pool.end();
    }
}

module.exports = new Database();