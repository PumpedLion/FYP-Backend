// src/controllers/manuscriptController.ts
import { Response } from 'express';
import prisma from '../models';
import { AuthRequest } from '../middleware/authMiddleware';

// --- Manuscript CRUD ---

export const createManuscript = async (req: AuthRequest, res: Response) => {
    const { title, subtitle, genre, description, tags, coverUrl } = req.body;
    const authorId = req.user.userId;

    const manuscript = await prisma.manuscript.create({
        data: {
            title,
            subtitle,
            genre,
            description,
            tags: tags || [],
            coverUrl,
            authorId,
        },
    });

    // Notify user of their own action (for activity feed)
    const { createNotification } = await import('./notificationController');
    await createNotification(
        authorId,
        'SYSTEM',
        'Manuscript Created',
        `You created a new manuscript: "${title}"`,
        { manuscriptId: manuscript.id }
    );

    return res.status(201).json({ message: 'Manuscript created successfully', manuscript });
};

export const getMyManuscripts = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;

    // Get manuscripts where user is author OR collaborator
    const manuscripts = await prisma.manuscript.findMany({
        where: {
            OR: [
                { authorId: userId },
                { collaborations: { some: { userId } } }
            ],
        },
        include: {
            author: {
                select: { id: true, fullName: true, email: true, avatarUrl: true }
            },
            collaborations: true
        },
        orderBy: { updatedAt: 'desc' }
    });

    return res.status(200).json({ manuscripts });
};

export const getAllManuscripts = async (req: AuthRequest, res: Response) => {
    // Get all manuscripts that are public (or just all for now if visibility isn't strictly enforced yet)
    // For now, let's fetch all and include author info
    const manuscripts = await prisma.manuscript.findMany({
        where: { status: 'PUBLISHED' },
        include: {
            author: {
                select: { id: true, fullName: true, avatarUrl: true }
            },
            chapters: {
                select: { id: true }
            }
        },
        orderBy: { updatedAt: 'desc' }
    });

    return res.status(200).json({ manuscripts });
};

export const getManuscriptById = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const manuscript = await prisma.manuscript.findUnique({
        where: { id: Number(id) },
        include: {
            author: {
                select: { id: true, fullName: true, email: true, avatarUrl: true }
            },
            collaborations: {
                include: {
                    user: {
                        select: { id: true, fullName: true, avatarUrl: true, email: true }
                    }
                }
            }
        }
    });

    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });

    return res.status(200).json({ manuscript });
};

export const updateManuscript = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, subtitle, genre, description, tags, coverUrl } = req.body;
    const userId = req.user.userId;

    const manuscript = await prisma.manuscript.findUnique({
        where: { id: Number(id) },
        include: { collaborations: true }
    });

    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });

    // Only Author or Editors can update
    const isAuthor = manuscript.authorId === userId;
    const isEditor = manuscript.collaborations.some(c => c.userId === userId && c.status === 'ACCEPTED' && c.role === 'EDITOR');

    if (!isAuthor && !isEditor) {
        return res.status(403).json({ message: 'Permission denied' });
    }

    const updatedManuscript = await prisma.manuscript.update({
        where: { id: Number(id) },
        data: { title, subtitle, genre, description, tags, coverUrl, status: req.body.status },
    });

    // Notify if published
    if (req.body.status === 'PUBLISHED' && manuscript.status !== 'PUBLISHED') {
        const { createNotification } = await import('./notificationController');
        await createNotification(
            userId,
            'SYSTEM',
            'Manuscript Published',
            `You published your manuscript: "${updatedManuscript.title}"`,
            { manuscriptId: updatedManuscript.id }
        );
    }

    return res.status(200).json({ message: 'Manuscript updated successfully', manuscript: updatedManuscript });
};

export const deleteManuscript = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const userId = req.user.userId;

    const manuscript = await prisma.manuscript.findUnique({
        where: { id: Number(id) }
    });

    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });

    // Only Author can delete
    if (manuscript.authorId !== userId) {
        return res.status(403).json({ message: 'Only the author can delete this manuscript' });
    }

    await prisma.manuscript.delete({ where: { id: Number(id) } });

    return res.status(200).json({ message: 'Manuscript deleted successfully' });
};

// --- Collaboration Logic ---

export const inviteCollaborator = async (req: AuthRequest, res: Response) => {
    const { manuscriptId, email, role } = req.body;
    const userId = req.user.userId;

    const manuscript = await prisma.manuscript.findUnique({
        where: { id: Number(manuscriptId) }
    });

    if (!manuscript) return res.status(404).json({ message: 'Manuscript not found' });
    if (manuscript.authorId !== userId) return res.status(403).json({ message: 'Only the author can invite collaborators' });

    // Check if collaborator already exists
    const existingCollab = await prisma.collaboration.findUnique({
        where: { manuscriptId_email: { manuscriptId: Number(manuscriptId), email } }
    });

    if (existingCollab) return res.status(400).json({ message: 'Invitation already sent to this email' });

    // Check if invited user exists in the system
    const invitedUser = await prisma.user.findUnique({ where: { email } });

    const collaboration = await prisma.collaboration.create({
        data: {
            manuscriptId: Number(manuscriptId),
            email,
            role: role || 'VIEWER',
            userId: invitedUser ? invitedUser.id : null,
            status: 'PENDING'
        }
    });

    // TODO: Send invitation email here (using transporter from userController or shared utils)

    // Trigger internal notification if user exists
    if (invitedUser) {
        const { createNotification } = await import('./notificationController');
        const sender = await prisma.user.findUnique({ where: { id: userId } });

        await createNotification(
            invitedUser.id,
            'COLLABORATION',
            'Collaboration Request',
            `${sender?.fullName || 'Someone'} wants to collaborate on "${manuscript.title}".`,
            { manuscriptId, collaborationId: collaboration.id }
        );
    }

    return res.status(201).json({ message: 'Invitation sent successfully', collaboration });
};

export const respondToInvitation = async (req: AuthRequest, res: Response) => {
    const { collaborationId, status } = req.body; // status: 'ACCEPTED' or 'DECLINED'
    const userId = req.user.userId;

    const collaboration = await prisma.collaboration.findUnique({
        where: { id: Number(collaborationId) }
    });

    if (!collaboration) return res.status(404).json({ message: 'Invitation not found' });

    // Ensure the logged-in user's email matches the invitation OR the userId matches
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || (collaboration.email !== user.email && collaboration.userId !== userId)) {
        return res.status(403).json({ message: 'This invitation is not for you' });
    }

    if (collaboration.status !== 'PENDING') {
        return res.status(400).json({ message: 'Invitation has already been processed' });
    }

    const updatedCollaboration = await prisma.collaboration.update({
        where: { id: Number(collaborationId) },
        data: {
            status,
            userId: status === 'ACCEPTED' ? userId : collaboration.userId
        }
    });

    // If invitation accepted, promote global role from READER to EDITOR
    if (status === 'ACCEPTED') {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user && user.role === 'READER') {
            await prisma.user.update({
                where: { id: userId },
                data: { role: 'EDITOR' }
            });
        }
    }

    // Notify the author about the response
    const manuscript = await prisma.manuscript.findUnique({
        where: { id: collaboration.manuscriptId }
    });
    if (manuscript && status === 'ACCEPTED') {
        const { createNotification } = await import('./notificationController');
        await createNotification(
            manuscript.authorId,
            'COLLABORATION',
            'Invitation Accepted',
            `${user.fullName} (${user.email}) has accepted your invitation to collaborate on "${manuscript.title}" as an ${collaboration.role.toLowerCase()}.`,
            { manuscriptId: manuscript.id, collaborationId: collaboration.id, status }
        );
    } else if (manuscript && status === 'DECLINED') {
        const { createNotification } = await import('./notificationController');
        await createNotification(
            manuscript.authorId,
            'COLLABORATION',
            'Invitation Declined',
            `${user.fullName} has declined your invitation to collaborate on "${manuscript.title}".`,
            { manuscriptId: manuscript.id, status }
        );
    }

    return res.status(200).json({ message: `Invitation ${status.toLowerCase()}`, collaboration: updatedCollaboration });
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    const userId = req.user.userId;

    try {
        // 1. Total Manuscripts (Author or Collaborator)
        const totalManuscripts = await prisma.manuscript.count({
            where: {
                OR: [
                    { authorId: userId },
                    { collaborations: { some: { userId, status: 'ACCEPTED' } } }
                ],
            }
        });

        // 2. Published Books (Author or Collaborator)
        const publishedBooks = await prisma.manuscript.count({
            where: {
                AND: [
                    { status: 'PUBLISHED' },
                    {
                        OR: [
                            { authorId: userId },
                            { collaborations: { some: { userId, status: 'ACCEPTED' } } }
                        ]
                    }
                ]
            }
        });

        // 3. Total Reads
        const manuscripts = await prisma.manuscript.findMany({
            where: {
                OR: [
                    { authorId: userId },
                    { collaborations: { some: { userId, status: 'ACCEPTED' } } }
                ],
            },
            select: { reads: true, price: true }
        });

        const totalReads = manuscripts.reduce((acc, m) => acc + (m.reads || 0), 0);

        // 4. Earnings (Placeholder logic: based on price if published, maybe 0 for now until actual sales)
        const totalEarnings = manuscripts.reduce((acc, m) => acc + (m.price || 0), 0);

        return res.status(200).json({
            stats: {
                totalManuscripts,
                publishedBooks,
                totalReads,
                totalEarnings
            }
        });
    } catch (error: any) {
        return res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};
