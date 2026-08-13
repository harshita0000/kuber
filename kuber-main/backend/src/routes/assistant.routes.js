import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { Income, Expense, Goal, Bill, Subscription, Debt, Challenge, Badge } from '../models/FinanceModels.js';

const router = Router();
router.use(authMiddleware);

router.post('/summary', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [income, expenses, goals, bills] = await Promise.all([
      Income.find({ userId }),
      Expense.find({ userId }),
      Goal.find({ userId }),
      Bill.find({ userId }),
    ]);

    const thisMonth = new Date().toISOString().slice(0, 7);
    const monthSpend = expenses
      .filter((e) => e.date?.startsWith(thisMonth))
      .reduce((s, e) => s + (e.amount || 0), 0);
    const totalSaved = goals.reduce((s, g) => s + (g.saved || 0), 0);
    const nextBills = bills
      .filter((b) => new Date(b.dueDate) >= new Date())
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
      .slice(0, 2);

    const human = `You're doing great — spent ₹${monthSpend} this month, saved ₹${totalSaved}. ` +
      (goals[0] ? `Progress on ${goals[0].name}: ${Math.round((goals[0].saved / goals[0].target) * 100)}%. ` : '') +
      (nextBills[0] ? `Upcoming bills: ${nextBills.map(b => `${b.name} on ${b.dueDate}`).join(', ')}.` : '');

    res.json({ message: human, data: { monthSpend, totalSaved, nextBills } });
  } catch (e) { next(e); }
});

router.post('/chat', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: { message: 'query is required' } });

    const [income, expenses, goals, bills, subscriptions, debts, challenges, badges] = await Promise.all([
      Income.find({ userId }),
      Expense.find({ userId }),
      Goal.find({ userId }),
      Bill.find({ userId }),
      Subscription.find({ userId }),
      Debt.find({ userId }),
      Challenge.find({ userId }),
      Badge.find({ userId }),
    ]);

    const totalIncome = income.reduce((s, i) => s + (i.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    const systemPrompt = `You are a helpful personal finance assistant. Analyze the user's financial data and provide clear, actionable insights.

Financial Summary:
- Total Income: ₹${totalIncome}
- Total Expenses: ₹${totalExpenses}
- Net Balance: ₹${totalIncome - totalExpenses}

Detailed Data:
${JSON.stringify({ income, expenses, goals, bills, subscriptions, debts, challenges, badges }, null, 2)}

Provide concise, friendly advice. Use emojis sparingly. Focus on actionable insights and encouragement.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nUser question: ${query}` }] }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return res.status(502).json({ error: { message: 'AI service error' } });
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response.';

    res.json({ response: reply });
  } catch (e) { next(e); }
});

export default router;


