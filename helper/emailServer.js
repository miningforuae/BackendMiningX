import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Get current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_EMAIL,
        pass: process.env.GMAIL_PASSWORD
    }
});

export async function sendEmail(to, subject, template, data) {
    try {
        // Construct proper file path using path.join
        const templatePath = path.join(__dirname, '..', 'views', `${template}.ejs`);
        
        // Render template
        const html = await ejs.renderFile(templatePath, data);
        
        const mailOptions = {
            from: process.env.GMAIL_EMAIL, 
            to,
            subject,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent successfully:', info.messageId);
        return true;
    } catch (err) {
        console.error('Email sending error:', err);
        throw new Error(`Failed to send email: ${err.message}`);
    }
}
