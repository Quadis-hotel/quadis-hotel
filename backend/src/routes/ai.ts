import { Router, Request, Response } from 'express'
import { aiService } from '../services/AIService'
import { db } from '../db'
import { requireAdmin } from '../middleware/auth'

export const aiRouter = Router()

// POST /api/ai/chat — Main agentic conversation endpoint for Quadis Assist
aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const { sessionId = `sess_${Date.now()}`, message, history = [] } = req.body

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message text is required' })
    }

    const { reply, toolsInvoked, handoffTriggered } = await aiService.chat(sessionId, message, history)

    // Log chat turn into database for auditing & analytics
    try {
      await db.createChatLog({
        session_id: sessionId,
        user_message: message,
        bot_response: reply,
        tools_invoked: toolsInvoked,
        handoff_triggered: handoffTriggered,
      })
    } catch (dbErr) {
      console.error('Failed to save chat log to DB:', dbErr)
    }

    res.json({
      success: true,
      data: {
        reply,
        toolsInvoked,
        handoffTriggered,
        sessionId,
      },
    })
  } catch (err: any) {
    console.error('Error in /api/ai/chat:', err)
    res.status(500).json({ success: false, error: err.message || 'AI processing failure' })
  }
})

// GET /api/ai/logs — Retrieve recent AI turns for debugging and quality review
aiRouter.get('/logs', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const logs = Array.from(db.memoryChatLogs.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    res.json({ success: true, count: logs.length, data: logs })
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to fetch AI chat logs' })
  }
})
