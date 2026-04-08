import { Request, Response } from 'express';
import prisma from '../models/index.js';
import PDFDocument from 'pdfkit';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

// --- Email Configuration ---
const smtpUser = process.env.SMTP_USER?.trim().replace(/^["']|["']$/g, '') || '';
const smtpPass = process.env.SMTP_PASS?.trim().replace(/^["']|["']$/g, '') || '';
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

const transporter = smtpUser && smtpPass ? nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure, // true for 465, false for other ports
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    rejectUnauthorized: false
  }
}) : null;

// --- PDF Generation Utility ---
const generateInvoicePDF = (purchase: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      let buffers: any[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      // Header
      doc.fontSize(25).text('Invoice', { align: 'center' });
      doc.moveDown();

      // Company Info
      doc.fontSize(12).text('YourTales', { align: 'right' });
      doc.text('Kathmandu, Nepal', { align: 'right' });
      doc.moveDown();

      // Customer Info
      doc.fontSize(14).text('Billed To:');
      doc.fontSize(12).text(purchase.user.fullName);
      doc.text(purchase.user.email);
      doc.moveDown();

      // Invoice Details
      doc.text(`Invoice Number: INV-${purchase.id.toString().padStart(6, '0')}`);
      doc.text(`Date of Purchase: ${new Date(purchase.createdAt).toLocaleDateString()}`);
      doc.text(`Transaction ID: ${purchase.transactionCode || purchase.pidx || 'N/A'}`);
      doc.text(`Payment Gateway: ${purchase.gateway}`);
      doc.moveDown(2);

      // Item Table Header
      doc.fontSize(12).font('Helvetica-Bold');
      doc.text('Item Description', 50, doc.y);
      doc.text('Price (NPR)', 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown(0.5);
      
      doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(0.5);

      // Item Row
      doc.font('Helvetica');
      doc.text(purchase.manuscript.title, 50, doc.y);
      doc.text(`${purchase.amount.toFixed(2)}`, 400, doc.y, { width: 100, align: 'right' });
      doc.moveDown(1.5);

      // Total
      doc.moveTo(50, doc.y).lineTo(500, doc.y).stroke();
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold');
      doc.text('Total:', 300, doc.y, { width: 100, align: 'right' });
      doc.text(`${purchase.amount.toFixed(2)}`, 400, doc.y, { width: 100, align: 'right' });

      // Footer
      doc.moveDown(3);
      doc.font('Helvetica').fontSize(10).text('Thank you for your purchase!', { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// --- Controllers ---

/**
 * GET /api/payments/invoice/:manuscriptId
 * Supports '?token=' for direct browser links
 */
export const downloadInvoice = async (req: Request, res: Response) => {
  const manuscriptId = Number(req.params.manuscriptId);
  
  // Extract token from Auth Header or URL Query Parameter
  let token = req.query.token as string;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1]!;
  }

  if (!token) {
    return res.status(401).send('<h1>Unauthorized - No token provided</h1>');
  }

  let userId: number;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { userId: number };
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).send('<h1>Unauthorized - Invalid or expired token</h1>');
  }

  try {
    const purchase = await prisma.purchase.findUnique({
      where: { userId_manuscriptId: { userId, manuscriptId } },
      include: { user: true, manuscript: true },
    });

    if (!purchase || purchase.status !== 'COMPLETED') {
      return res.status(404).send('<h1>No completed purchase found for this manuscript</h1>');
    }

    const pdfBuffer = await generateInvoicePDF(purchase);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice_${purchase.id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.end(pdfBuffer);
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('<h1>Error generating invoice</h1>');
  }
};

/**
 * Utility function to send an email with the PDF invoice
 */
export const sendInvoiceEmail = async (userId: number, manuscriptId: number) => {
  if (!transporter) {
    console.warn('SMTP not configured. Skipping automated email invoice.');
    return;
  }

  try {
    const purchase = await prisma.purchase.findUnique({
      where: { userId_manuscriptId: { userId, manuscriptId: Number(manuscriptId) } },
      include: { user: true, manuscript: true },
    });

    if (!purchase || purchase.status !== 'COMPLETED') return;

    const pdfBuffer = await generateInvoicePDF(purchase);

    await transporter.sendMail({
      from: `"YourTales Billing" <${smtpUser}>`,
      to: purchase.user.email as string,
      subject: `Your Receipt for "${purchase.manuscript.title}"`,
      html: `
        <p>Hi ${purchase.user.fullName},</p>
        <p>Thank you for purchasing <strong>${purchase.manuscript.title}</strong>.</p>
        <p>We've attached your invoice to this email.</p>
        <br/>
        <p>Happy Reading!</p>
        <p>The YourTales Team</p>
      `,
      attachments: [
        {
          filename: `Invoice_${purchase.id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    console.log(`Invoice email sent to ${purchase.user.email}`);
  } catch (error) {
    console.error('Error sending invoice email:', error);
  }
};
