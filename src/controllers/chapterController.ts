// src/controllers/chapterController.ts
import { Response } from 'express';
import prisma from '../models';
import { AuthRequest } from '../middleware/authMiddleware';

export const createChapter = async (req: AuthRequest, res: Response) => {
    const { manuscriptId, title, content, order } = req.body;
    const userId = req.user.userId;

    const manuscript = await prisma.manuscript.findUnique({
        where: { id: Number(manuscriptId) },
        include: { collaborations: true }
    });

    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });

    // Permissions: Author or Editor collaborator
    const isAuthor = manuscript.authorId === userId;
    const isEditor = manuscript.collaborations.some((c: any) => c.userId === userId && c.role === 'EDITOR' && c.status === 'ACCEPTED');

    if (!isAuthor && !isEditor) {
        return res.status(403).json({ message: 'Only authors or editors can create chapters' });
    }

    const chapter = await prisma.chapter.create({
        data: {
            manuscriptId: Number(manuscriptId),
            title,
            content,
            order: order || 0,
        },
    });

    // Notify Followers
    const { createBulkNotifications } = await import('./notificationController');
    const followers = await prisma.follow.findMany({
        where: { followingId: manuscript.authorId },
        select: { followerId: true }
    });

    if (followers.length > 0) {
        const followerIds = followers.map(f => f.followerId);
        const author = await prisma.user.findUnique({ where: { id: manuscript.authorId } });

        await createBulkNotifications(
            followerIds,
            'FOLLOW',
            'New Chapter Published',
            `${author?.fullName || 'An author you follow'} published a new chapter "${title}" in "${manuscript.title}"`,
            { manuscriptId: manuscript.id, chapterId: chapter.id, authorId: manuscript.authorId }
        );
    }

    return res.status(201).json({ message: 'Chapter created successfully', chapter });
};

export const getChaptersByManuscript = async (req: AuthRequest, res: Response) => {
    const { manuscriptId } = req.params;

    const manuscript = await prisma.manuscript.findUnique({
        where: { id: Number(manuscriptId) },
    });

    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });

    const chapters = await prisma.chapter.findMany({
        where: { manuscriptId: Number(manuscriptId) },
        orderBy: { order: 'asc' },
    });

    return res.status(200).json({ chapters });
};

export const getChapterById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(id) },
        include: { manuscript: true }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    // Increment read count
    await prisma.manuscript.update({
        where: { id: chapter.manuscriptId },
        data: { reads: { increment: 1 } }
    });

    // Emit real-time stat update to the author
    const { emitToUser } = await import('../services/socketService');
    emitToUser(chapter.manuscript.authorId, 'stats_update', { type: 'READ_INCREMENT' });

    return res.status(200).json({ chapter });
};

export const updateChapter = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, content, order } = req.body;
    const userId = req.user.userId;

    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(id) },
        include: { manuscript: { include: { collaborations: true } } }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    // Permissions: Author or Editor collaborator
    const isAuthor = chapter.manuscript.authorId === userId;
    const isEditor = chapter.manuscript.collaborations.some((c: any) => c.userId === userId && c.role === 'EDITOR' && c.status === 'ACCEPTED');

    if (!isAuthor && !isEditor) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    // Restriction: Editor cannot rename the chapter
    if (isEditor && !isAuthor) {
        if (title && title !== chapter.title) {
            return res.status(403).json({ message: 'Editors are not allowed to rename chapters.' });
        }
    }

    const updatedChapter = await prisma.chapter.update({
        where: { id: Number(id) },
        data: { title, content, order },
    });

    return res.status(200).json({ message: 'Chapter updated successfully', chapter: updatedChapter });
};

export const deleteChapter = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(id) },
        include: { manuscript: true }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    // Permissions: Author only
    if (chapter.manuscript.authorId !== userId) {
        return res.status(403).json({ message: 'Only the author can delete chapters' });
    }

    await prisma.chapter.delete({ where: { id: Number(id) } });

    return res.status(200).json({ message: 'Chapter deleted successfully' });
};
