// src/routers/notificationRoutes.ts
import express from 'express';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
} from '../controllers/notificationController.js';
import { protect } from '../middleware/authMiddleware.js';
import catchAsync from '../utils/catchAsync.js';

const router = express.Router();

router.use(protect);

router.get('/', catchAsync(getNotifications));
router.patch('/mark-all-read', catchAsync(markAllAsRead));
router.patch('/:id/read', catchAsync(markAsRead));
router.delete('/:id', catchAsync(deleteNotification));

export default router;
