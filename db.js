const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

class Database {
    constructor() {
        // Определяем путь к файлу БД в зависимости от окружения
        let dbPath;
        
        if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
            // На Render используем /tmp директорию для записи
            dbPath = '/tmp/xtteam_database.db';
            console.log('🚀 Режим Render/Production, БД будет сохранена в:', dbPath);
        } else {
            // Локальная разработка
            dbPath = path.join(__dirname, 'database.db');
            console.log('💻 Локальный режим, БД будет сохранена в:', dbPath);
        }
        
        // Проверяем и создаем директорию если нужно
        const dir = path.dirname(dbPath);
        if (dir && !fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
                console.log('📁 Создана директория:', dir);
            } catch (err) {
                console.error('❌ Ошибка создания директории:', err);
            }
        }
        
        // Подключаемся к БД
        this.db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('❌ Ошибка подключения к БД:', err);
                console.error('Путь к БД:', dbPath);
            } else {
                console.log('✅ Подключено к SQLite базе данных');
                console.log('📍 Путь:', dbPath);
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
        `, (err) => {
            if (err) console.error('Ошибка создания таблицы users:', err);
        });

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
        `, (err) => {
            if (err) console.error('Ошибка создания таблицы achievements:', err);
        });

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
        `, (err) => {
            if (err) console.error('Ошибка создания таблицы user_achievements:', err);
        });

        // Добавляем базовые достижения с задержкой чтобы таблицы успели создать
        setTimeout(() => {
            this.initAchievements();
        }, 100);
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
            
            if (!row || row.count === 0) {
                console.log('Добавляем базовые достижения...');
                let successCount = 0;
                let errorCount = 0;
                
                for (const achievement of achievements) {
                    try {
                        await this.addAchievement(achievement);
                        successCount++;
                    } catch (error) {
                        console.error('Ошибка при добавлении достижения:', error.message);
                        errorCount++;
                    }
                }
                
                console.log(`✅ Базовые достижения добавлены: ${successCount} успешно, ${errorCount} с ошибками`);
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
                    if (err) {
                        console.error('Ошибка поиска достижения:', err);
                        reject(err);
                    } else if (!achievement) {
                        console.log(`Достижение "${achievementName}" не найдено в базе`);
                        resolve(false);
                    } else {
                        // Проверяем, не разблокировано ли уже
                        this.db.get(
                            "SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_id = ?",
                            [userId, achievement.id],
                            async (err, row) => {
                                if (err) {
                                    console.error('Ошибка проверки разблокировки:', err);
                                    reject(err);
                                } else if (row) {
                                    console.log(`Достижение "${achievementName}" уже разблокировано у пользователя ${userId}`);
                                    resolve(false); // Уже разблокировано
                                } else {
                                    // Разблокируем
                                    this.db.run(
                                        "INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)",
                                        [userId, achievement.id],
                                        (err) => {
                                            if (err) {
                                                console.error('Ошибка разблокировки достижения:', err);
                                                reject(err);
                                            } else {
                                                console.log(`🏆 Достижение "${achievementName}" разблокировано для пользователя ${userId}`);
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

    async getAllAchievements() {
        return new Promise((resolve, reject) => {
            this.db.all("SELECT * FROM achievements ORDER BY category, id", (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Метод для проверки состояния БД
    async checkDatabaseStatus() {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT COUNT(*) as user_count FROM users", (err, userRow) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                this.db.get("SELECT COUNT(*) as achievement_count FROM achievements", (err, achievementRow) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    this.db.get("SELECT COUNT(*) as user_achievement_count FROM user_achievements", (err, uaRow) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        resolve({
                            users: userRow.user_count,
                            achievements: achievementRow.achievement_count,
                            user_achievements: uaRow.user_achievement_count,
                            status: 'OK'
                        });
                    });
                });
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = new Database();