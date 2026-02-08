// src/routers/notificationRoutes.ts
import express from 'express';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
} from '../controllers/notificationController';
import { protect } from '../middleware/authMiddleware';
import catchAsync from '../utils/catchAsync';

const router = express.Router();

router.use(protect);

router.get('/', catchAsync(getNotifications));
router.patch('/mark-all-read', catchAsync(markAllAsRead));
router.patch('/:id/read', catchAsync(markAsRead));
router.delete('/:id', catchAsync(deleteNotification));

export default router;
