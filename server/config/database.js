const path = require('path');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

const configs = {
    sqlite: {
        client: 'sqlite3',
        connection: {
            filename: path.resolve(__dirname, '..', process.env.SQLITE_FILENAME || './data.db')
        },
        useNullAsDefault: true,
        pool: {
            afterCreate: (conn, cb) => {
                // SQLite 开启外键约束支持
                conn.run('PRAGMA foreign_keys = ON', cb);
            }
        }
    },
    mysql: {
        client: 'mysql2',
        connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'omaid',
            charset: 'utf8mb4'
        },
        pool: { min: 2, max: 10 }
    },
    postgres: {
        client: 'pg',
        connection: {
            host: process.env.DB_HOST || '127.0.0.1',
            port: Number(process.env.DB_PORT) || 5432,
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'omaid',
            ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false
        },
        pool: { min: 2, max: 10 }
    }
};

if (!configs[dbType]) {
    throw new Error(`[Database Config] 不支持的数据库类型: "${dbType}"，仅支持 sqlite, mysql, postgres`);
}

module.exports = {
    dbType,
    knexConfig: configs[dbType]
};
