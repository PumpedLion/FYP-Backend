// src/controllers/notificationController.ts
import { Response } from 'express';
import prisma from '../models';
import { AuthRequest } from '../middleware/authMiddleware';
import { NotificationType } from '../../generated/prisma';

// --- Helper Functions ---

export const createNotification = async (
    recipientId: number,
    type: NotificationType,
    title: string,
    message: string,
    data?: any
) => {
    return await prisma.notification.create({
        data: {
            recipientId,
            type,
            title,
            message,
            data: data || {},
        },
    });
};

// --- Controllers ---

export const getNotifications = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;
    const { type, isRead } = req.query;

    const where: any = { recipientId: userId };
    if (type) where.type = type;
    if (isRead !== undefined) where.isRead = isRead === 'true';

    const notifications = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
    });

    const unreadCount = await prisma.notification.count({
        where: { recipientId: userId, isRead: false },
    });

    return res.status(200).json({ notifications, unreadCount });
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const notification = await prisma.notification.findUnique({
        where: { id: Number(id) },
    });

    if (!notification || notification.recipientId !== userId) {
        return res.status(404).json({ message: 'Notification not found' });
    }

    const updatedNotification = await prisma.notification.update({
        where: { id: Number(id) },
        data: { isRead: true },
    });

    return res.status(200).json({ message: 'Notification marked as read', notification: updatedNotification });
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;

    await prisma.notification.updateMany({
        where: { recipientId: userId, isRead: false },
        data: { isRead: true },
    });

    return res.status(200).json({ message: 'All notifications marked as read' });
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const notification = await prisma.notification.findUnique({
        where: { id: Number(id) },
    });

    if (!notification || notification.recipientId !== userId) {
        return res.status(404).json({ message: 'Notification not found' });
    }

    await prisma.notification.delete({
        where: { id: Number(id) },
    });

    return res.status(200).json({ message: 'Notification deleted successfully' });
};
