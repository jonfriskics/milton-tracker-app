import express from 'express'
import { join } from 'node:path'
import helmet from 'helmet'
import { body, validationResult } from 'express-validator'
import { createLogger, format, transports } from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const sqlite3 = require('sqlite3').verbose()

const app = express()

app.set('view engine', 'ejs')
app.set('views', 'views')
app.set('trust proxy', true)

app.use(express.static('public'))
app.use(express.json({
  limit: '50kb'
}))

app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "script-src": ["'self'", "jonfriskics.net"],
            "font-src": ["'self'", "cdnjs.cloudflare.com"]
        },
    },
    crossOriginEmbedderPolicy: false
}))

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`
        })
    ),
    transports: [
        new transports.Console(),
        new DailyRotateFile({
            filename: 'logs/application-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m',
            maxFiles: '14d'
        })
    ]
})

const db = new sqlite3.Database(join(process.cwd(), 'milton_tracker.db'), (err) => {
    if (err) {
        console.error(err.message)
    }
    console.log('Connected to SQLite database.')
})

db.run(`CREATE TABLE IF NOT EXISTS milton_tracker (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hasCellSignal BOOLEAN,
    hasInternet BOOLEAN,
    hasPower BOOLEAN,
    timestamp INTEGER
)`)

app.use((req, res, next) => {
    const { method, url, headers } = req
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    logger.info(`Request: ${method} ${url} from IP: ${ip}`)
    next()
})

app.get('/milton', (req, res) => {
    const query = `SELECT hasPower, hasInternet, hasCellSignal, timestamp FROM milton_tracker ORDER BY timestamp DESC`

    db.all(query, [], (err, rows) => {
        if (err) {
            logger.error(`Database query failed: ${err.message}`)
            console.error(err.message)
            res.status(500).send('Database error.')
        } else {
            logger.info('Fetched data successfully from the database.')

const lastUpdated = rows.length > 0 
    ? new Intl.DateTimeFormat('en-US', { 
        timeZone: 'America/New_York', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: 'numeric', 
        second: 'numeric' 
    }).format(new Date(rows[0].timestamp * 1000)) 
    : 'No updates available'
            res.render('log', { data: rows, lastUpdated: lastUpdated })
        }
    })
})

app.post('/api/save', [
    body('hasCellSignal').isBoolean(),
    body('hasInternet').isBoolean(),
    body('hasPower').isBoolean(),
    body('timestamp').isInt(),
    body('api_key').exists()
],(req, res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { hasCellSignal, hasInternet, hasPower, timestamp } = req.body
    const api_key = req.body.api_key

    logger.warn(`${hasCellSignal} ${hasInternet} ${hasPower} ${timestamp}`)

    if(api_key != process.env.API_KEY) {
        logger.warn('Unauthorized attempt to access the /api/save endpoint.')
	    logger.warn(`api_key ${api_key} env key ${process.env.API_KEY}`)
        return res.status(403).send(`not allowed`)
    }
    db.run(`INSERT INTO milton_tracker (hasCellSignal, hasInternet, hasPower, timestamp) VALUES (?, ?, ?, ?)`,
        [hasCellSignal, hasInternet, hasPower, timestamp],
        (err) => {
            if (err) {
                logger.error(`Failed to save data: ${err.message}`)
                console.error(err.message)
                res.status(500).send('Failed to save data.')
            } else {
                logger.info('Data saved successfully.')
                res.status(200).send('Data saved successfully.')
            }
        }
    )
})

app.use((err, req, res, next) => {
    logger.error(`Error: ${err.message}\nStack: ${err.stack}`)
    console.error(err.stack)
    res.status(500).send('Something went wrong.')
})

process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server')
    server.close(() => {
        logger.info('HTTP server closed')
        db.close((err) => {
            if (err) {
                logger.error(`Error closing the database connection: ${err.message}`)
            } else {
                logger.info('Database connection closed.')
            }
            process.exit(0)
        })
    })
})

app.listen(process.env.PORT, () => {
   console.log(`Server running on http://localhost:${process.env.PORT}`)
})
