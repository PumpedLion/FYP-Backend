// src/services/socketService.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';

let io: SocketIOServer;

export const initSocket = (server: HTTPServer) => {
    io = new SocketIOServer(server, {
        cors: {
            origin: "*", // Adjust as needed for security
            methods: ["GET", "POST"]
        }
    });

    io.use((socket: Socket, next) => {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        if (!token) {
            return next(new Error('Authentication error: No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
            (socket as any).userId = decoded.userId;
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket: Socket) => {
        const userId = (socket as any).userId;
        console.log(`User connected: ${userId} (Socket ID: ${socket.id})`);

        // Join a room specific to this user for private notifications
        socket.join(`user:${userId}`);

        socket.on('join_chapter', (chapterId: string) => {
            socket.join(`chapter:${chapterId}`);
            console.log(`User ${userId} joined chapter room: ${chapterId}`);
        });

        socket.on('leave_chapter', (chapterId: string) => {
            socket.leave(`chapter:${chapterId}`);
            console.log(`User ${userId} left chapter room: ${chapterId}`);
        });

        socket.on('disconnect', () => {
            console.log(`User disconnected: ${userId}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

// --- Helper Functions to Emit Events ---

export const emitToUser = (userId: number, event: string, data: any) => {
    if (io) {
        io.to(`user:${userId}`).emit(event, data);
    }
};

export const emitToChapter = (chapterId: number, event: string, data: any) => {
    if (io) {
        io.to(`chapter:${chapterId}`).emit(event, data);
    }
};
