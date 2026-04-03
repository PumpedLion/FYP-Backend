// src/controllers/suggestedEditController.ts
import { Response } from 'express';
import prisma from '../models';
import { AuthRequest } from '../middleware/authMiddleware';
import { emitToUser, emitToChapter } from '../services/socketService';

// POST /api/suggested-edits
// Editor submits a suggested edit for a chapter
export const createSuggestedEdit = async (req: AuthRequest, res: Response) => {
    const { chapterId, suggestedContent } = req.body;
    const editorId = req.user.userId;

    if (!chapterId || !suggestedContent) {
        return res.status(400).json({ message: 'chapterId and suggestedContent are required' });
    }

    // Verify chapter exists and that the user is indeed an EDITOR collaborator
    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(chapterId) },
        include: { manuscript: { include: { collaborations: true } } }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const isEditor = chapter.manuscript.collaborations.some(
        (c: any) => c.userId === editorId && c.role === 'EDITOR' && c.status === 'ACCEPTED'
    );

    if (!isEditor) {
        return res.status(403).json({ message: 'Only accepted editors can submit suggested edits' });
    }

    // Snapshot the current chapter content as the original baseline
    const originalContent = chapter.content || '';

    const suggestedEdit = await prisma.suggestedEdit.create({
        data: {
            chapterId: Number(chapterId),
            editorId,
            originalContent,
            suggestedContent,
            status: 'PENDING',
        },
        include: { editor: { select: { id: true, fullName: true, avatarUrl: true } } }
    });

    // Notify the manuscript author in real-time
    emitToUser(chapter.manuscript.authorId, 'suggestion_new', {
        suggestedEdit,
        chapterId: chapter.id,
        manuscriptId: chapter.manuscriptId,
    });

    return res.status(201).json({ message: 'Suggested edit submitted successfully', suggestedEdit });
};

// GET /api/suggested-edits/chapter/:chapterId
// Fetch all suggested edits for a chapter (author or editor only)
export const getSuggestedEditsForChapter = async (req: AuthRequest, res: Response) => {
    const { chapterId } = req.params;
    const userId = req.user.userId;

    const chapter = await prisma.chapter.findUnique({
        where: { id: Number(chapterId) },
        include: { manuscript: { include: { collaborations: true } } }
    });

    if (!chapter) return res.status(404).json({ message: 'Chapter not found' });

    const isAuthor = chapter.manuscript.authorId === userId;
    const isEditor = chapter.manuscript.collaborations.some(
        (c: any) => c.userId === userId && c.role === 'EDITOR' && c.status === 'ACCEPTED'
    );

    if (!isAuthor && !isEditor) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const suggestedEdits = await prisma.suggestedEdit.findMany({
        where: { chapterId: Number(chapterId) },
        include: { editor: { select: { id: true, fullName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ suggestedEdits });
};

// PATCH /api/suggested-edits/:id/accept
// Author accepts a suggestion → chapter content is replaced
export const acceptSuggestedEdit = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const suggestedEdit = await prisma.suggestedEdit.findUnique({
        where: { id: Number(id) },
        include: { chapter: { include: { manuscript: true } } }
    });

    if (!suggestedEdit) return res.status(404).json({ message: 'Suggested edit not found' });
    if (suggestedEdit.status !== 'PENDING') {
        return res.status(400).json({ message: 'This suggestion has already been resolved' });
    }
    if (suggestedEdit.chapter.manuscript.authorId !== userId) {
        return res.status(403).json({ message: 'Only the manuscript author can accept suggestions' });
    }

    // Replace chapter content + mark suggestion as ACCEPTED in a transaction
    const [updatedChapter, updatedEdit] = await prisma.$transaction([
        prisma.chapter.update({
            where: { id: suggestedEdit.chapterId },
            data: { content: suggestedEdit.suggestedContent },
        }),
        prisma.suggestedEdit.update({
            where: { id: Number(id) },
            data: { status: 'ACCEPTED' },
            include: { editor: { select: { id: true, fullName: true, avatarUrl: true } } }
        }),
    ]);

    // Notify the editor who submitted the suggestion
    emitToUser(suggestedEdit.editorId, 'suggestion_resolved', {
        id: updatedEdit.id,
        status: 'ACCEPTED',
        chapterId: suggestedEdit.chapterId,
    });

    // Broadcast the chapter update to all users in the chapter room
    emitToChapter(suggestedEdit.chapterId, 'chapter_content_updated', {
        chapterId: suggestedEdit.chapterId,
        content: suggestedEdit.suggestedContent,
    });

    return res.status(200).json({ message: 'Suggestion accepted', suggestedEdit: updatedEdit, chapter: updatedChapter });
};

// PATCH /api/suggested-edits/:id/decline
// Author declines a suggestion → chapter content unchanged
export const declineSuggestedEdit = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const suggestedEdit = await prisma.suggestedEdit.findUnique({
        where: { id: Number(id) },
        include: { chapter: { include: { manuscript: true } } }
    });

    if (!suggestedEdit) return res.status(404).json({ message: 'Suggested edit not found' });
    if (suggestedEdit.status !== 'PENDING') {
        return res.status(400).json({ message: 'This suggestion has already been resolved' });
    }
    if (suggestedEdit.chapter.manuscript.authorId !== userId) {
        return res.status(403).json({ message: 'Only the manuscript author can decline suggestions' });
    }

    const updatedEdit = await prisma.suggestedEdit.update({
        where: { id: Number(id) },
        data: { status: 'DECLINED' },
        include: { editor: { select: { id: true, fullName: true, avatarUrl: true } } }
    });

    // Notify the editor
    emitToUser(suggestedEdit.editorId, 'suggestion_resolved', {
        id: updatedEdit.id,
        status: 'DECLINED',
        chapterId: suggestedEdit.chapterId,
    });

    return res.status(200).json({ message: 'Suggestion declined', suggestedEdit: updatedEdit });
};
