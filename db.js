const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
            if (err) {
                console.error('Ошибка подключения к БД:', err);
            } else {
                console.log('✅ Подключено к SQLite базе данных');
                this.initTables();
            }
        });
    }

    initTables() {
        // Таблица пользователей
        this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                email TEXT UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица достижений
        this.db.run(`
            CREATE TABLE IF NOT EXISTS achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                icon_path TEXT,
                category TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Таблица связей пользователь-достижение
        this.db.run(`
            CREATE TABLE IF NOT EXISTS user_achievements (
                user_id INTEGER,
                achievement_id INTEGER,
                unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (achievement_id) REFERENCES achievements(id),
                PRIMARY KEY (user_id, achievement_id)
            )
        `);

        // Добавляем базовые достижения
        this.initAchievements();
    }

    async initAchievements() {
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
    
        // Проверяем, есть ли уже достижения
        this.db.get("SELECT COUNT(*) as count FROM achievements", async (err, row) => {
            if (err) {
                console.error('Ошибка при проверке достижений:', err);
                return;
            }
            
            // Исправление: проверяем row на существование
            if (!row || row.count === 0) {
                console.log('Добавляем базовые достижения...');
                for (const achievement of achievements) {
                    try {
                        await this.addAchievement(achievement);
                    } catch (error) {
                        console.error('Ошибка при добавлении достижения:', error);
                    }
                }
                console.log('✅ Базовые достижения добавлены');
            } else {
                console.log(`✅ В базе уже есть ${row.count} достижений`);
            }
        });
    }

    // Методы для пользователей
    async createUser(username, password, email = null) {
        const passwordHash = await bcrypt.hash(password, 10);
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)",
                [username, passwordHash, email],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async getUserByUsername(username) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async verifyUser(username, password) {
        const user = await this.getUserByUsername(username);
        if (!user) return false;
        
        return await bcrypt.compare(password, user.password_hash);
    }

    // Методы для достижений
    async addAchievement(achievement) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT INTO achievements (name, description, icon_path, category) VALUES (?, ?, ?, ?)",
                [achievement.name, achievement.description, achievement.icon_path, achievement.category],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    async unlockAchievement(userId, achievementName) {
        return new Promise(async (resolve, reject) => {
            // Находим достижение
            this.db.get(
                "SELECT id FROM achievements WHERE name = ?",
                [achievementName],
                async (err, achievement) => {
                    if (err) reject(err);
                    else if (!achievement) resolve(false);
                    else {
                        // Проверяем, не разблокировано ли уже
                        this.db.get(
                            "SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
                            [userId, achievement.id],
                            async (err, row) => {
                                if (err) reject(err);
                                else if (row) resolve(false); // Уже разблокировано
                                else {
                                    // Разблокируем
                                    this.db.run(
                                        "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
                                        [userId, achievement.id],
                                        (err) => {
                                            if (err) reject(err);
                                            else {
                                                console.log(`🏆 Достижение разблокировано: ${achievementName} для пользователя ${userId}`);
                                                resolve(true);
                                            }
                                        }
                                    );
                                }
                            }
                        );
                    }
                }
            );
        });
    }

    async getUserAchievements(userId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT a.*, 
                       CASE WHEN ua.user_id IS NOT NULL THEN 1 ELSE 0 END as unlocked
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                ORDER BY a.category, a.id
            `, [userId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT id, username, email, created_at FROM users WHERE id = ?", [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    close() {
        this.db.close();
    }
    async getAllAchievements() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM achievements ORDER BY category, id", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = new Database();