require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { notFound, errorHandler } = require('./middleware/errorHandler');
const { iniciarScheduler } = require('./jobs/scheduler');

const authRoutes = require('./routes/auth');
const membersRoutes = require('./routes/members');
const paymentsRoutes = require('./routes/payments');
const checkinsRoutes = require('./routes/checkins');
const notificationsRoutes = require('./routes/notifications');
const eventsRoutes = require('./routes/events');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/checkins', checkinsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/events', eventsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`VISA GYM API corriendo en http://localhost:${PORT}`);
  iniciarScheduler();
});
