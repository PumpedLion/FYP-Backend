// src/app.ts
import dotenv from 'dotenv';

// Configure dotenv FIRST before any other imports that might use environment variables
dotenv.config();

import express from 'express';
import cors from 'cors';
import userRouter from './routers/userRoutes';
import manuscriptRouter from './routers/manuscriptRoutes';
import notificationRouter from './routers/notificationRoutes';
import chapterRouter from './routers/chapterRoutes';
import commentRouter from './routers/commentRoutes';
import { createServer } from 'http';
import { initSocket } from './services/socketService';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// URL normalization middleware - removes double slashes
app.use((req, res, next) => {
  if (req.url.includes('//')) {
    req.url = req.url.replace(/\/+/g, '/');
  }
  next();
});

// Routes
app.get('/', (req, res) => {
  res.send('Welcome to the YourTales API');
});

app.use('/api/users', userRouter);
app.use('/api/manuscripts', manuscriptRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/chapters', chapterRouter);
app.use('/api/comments', commentRouter);

// Global Error Handler (Optional but recommended)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

// Start Server
const server = createServer(app);
initSocket(server);

const PORT = Number(process.env.PORT) || 8000;
const HOST = "localhost";

server.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
  console.log(`Socket.io is initialized and listening`);
});

export default app;