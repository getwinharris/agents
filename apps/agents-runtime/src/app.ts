import { bapX } from '@bapX/runtime/routing'
import { Hono } from 'hono'

const app = new Hono()
app.route('/api', bapX())

export default app
